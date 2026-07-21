/**
 * invoiceService.ts — Create, save, submit POS Invoices
 * Supports both 'POS Invoice' and 'Sales Invoice' based on POS Settings.
 * Online: frappe.client.insert + frappe.client.submit
 * Offline: save to IndexedDB + sync_queue
 */
import call from '../lib/call';
import {
  saveDraftInvoice,
  addToSyncQueue,
  cachePOSProfile,
  getCachedPOSProfile,
  getCachedPartyBalance,
  cachePrintFormat,
  getCachedPrintFormat,
} from '../db/posDB';
import type { CartItem, Customer, POSSession } from '../stores/posStore';
import { formatNumber, formatCurrency as formatWithCurrencySymbol } from '../lib/currency';
import nunjucks from 'nunjucks';

import posPrintFormat from '../print_templates/pos_print_format.json';
import standardPrintFormat from '../print_templates/standard_print_format.json';

if (!(String.prototype as any).format) {
  (String.prototype as any).format = function(this: string, ...args: any[]) {
    return this.replace(/{(\d+)}/g, (match, number) => {
      return typeof args[number] !== 'undefined' ? args[number] : match;
    });
  };
}

interface CreateInvoicePayload {
  session: POSSession;
  customer: Customer;
  cartItems: CartItem[];
  payments: Array<{ mode_of_payment: string; amount: number }>;
  discount?: number;
  additionalDiscount?: number;
  isOnline: boolean;
  subtotal?: number;
  grandTotal?: number;
  totalTaxes?: number;
  taxes?: any[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateOfflineId(posProfile: string, isOnline: boolean): string {
  const prefix = isOnline ? 'online' : 'offline';
  const profileClean = (posProfile || 'DEFAULT').replace(/[^a-zA-Z0-9]/g, '');
  const cookies = Object.fromEntries(
    document.cookie.split('; ').filter(Boolean).map((part) => {
      const [k, ...v] = part.split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
  const userClean = (cookies.user_id || 'Guest').replace(/[^a-zA-Z0-9]/g, '');
  const timestamp = Date.now();
  const uuid = uuidv4();
  return `${prefix}-${profileClean}-${userClean}-${timestamp}-${uuid}`;
}

function buildInvoiceDoc(payload: CreateInvoicePayload): Record<string, any> {
  const {
    session,
    customer,
    cartItems,
    payments,
    discount = 0,
    additionalDiscount = 0,
    isOnline,
  } = payload;

  const isPOSInvoice = session.invoice_type === 'POS Invoice';
  const doctype = isPOSInvoice ? 'POS Invoice' : 'Sales Invoice';

  // Build taxes table
  let docTaxes: any[] = [];
  const hasProfileTaxes = !!(session.taxes_and_charges && session.taxes_and_charges_data?.length);

  if (hasProfileTaxes) {
    docTaxes = session.taxes_and_charges_data.map((taxRow: any) => ({
      charge_type: taxRow.charge_type || 'On Net Total',
      account_head: taxRow.account_head,
      description: taxRow.description,
      rate: taxRow.rate || 0,
      category: taxRow.category || 'Total',
      add_deduct_tax: taxRow.add_deduct_tax || 'Add',
      cost_center: taxRow.cost_center || null,
    }));
  } else {
    const uniqueTaxes: Record<string, any> = {};
    cartItems.forEach((item) => {
      if (item.item_tax_rate) {
        let rates: Record<string, number> = {};
        try {
          rates = typeof item.item_tax_rate === 'string'
            ? JSON.parse(item.item_tax_rate)
            : item.item_tax_rate;
        } catch (e) {
          console.warn('Failed to parse item_tax_rate:', item.item_tax_rate, e);
        }
        Object.keys(rates).forEach((accountHead) => {
          if (!uniqueTaxes[accountHead]) {
            uniqueTaxes[accountHead] = {
              charge_type: 'On Net Total',
              account_head: accountHead,
              description: accountHead.split(' - ')[0],
              rate: 0,
              set_by_item_tax_template: 1,
              category: 'Total',
              add_deduct_tax: 'Add',
            };
          }
        });
      }
    });
    docTaxes = Object.values(uniqueTaxes);
  }

  const doc: Record<string, any> = {
    doctype,
    is_pos: 1,
    update_stock: 1,
    pos_profile: session.pos_profile,
    company: session.company,
    customer: customer.name,
    customer_name: customer.customer_name || customer.name || '',
    contact_mobile: customer.mobile_no || '',
    set_warehouse: session.warehouse,
    custom_offline_id: generateOfflineId(session.pos_profile, isOnline),
    currency: session.currency,
    selling_price_list: session.price_list,
    posting_date: today(),
    due_date: today(),
    additional_discount_percentage: discount,
    discount_amount: additionalDiscount,
    apply_discount_on: session.apply_discount_on || 'Grand Total',
    net_total: payload.subtotal || 0,
    total: payload.subtotal || 0,
    grand_total: payload.grandTotal || 0,
    disable_rounded_total: session.disable_rounded_total || 0,
    rounded_total: session.disable_rounded_total === 1 ? 0 : Math.round(payload.grandTotal || 0),
    total_taxes_and_charges: payload.totalTaxes || 0,
    paid_amount: payments.reduce((acc, p) => acc + p.amount, 0),
    ...(hasProfileTaxes ? { taxes_and_charges: session.taxes_and_charges } : {}),
    items: cartItems.flatMap((item) => {
      const baseItemFields = {
        item_code: item.item_code,
        item_name: item.item_name,
        uom: item.uom,
        warehouse: item.warehouse || session.warehouse,
        discount_percentage: item.discount_percentage || 0,
        ...(!hasProfileTaxes ? {
          item_tax_template: item.item_tax_template || null,
          item_tax_rate: typeof item.item_tax_rate === 'object' ? JSON.stringify(item.item_tax_rate) : (item.item_tax_rate || '{}')
        } : {}),
        conversion_factor: item.conversion_factor || 1,
      };

      if (item.allocations && item.allocations.length > 0) {
        return item.allocations.map((alloc) => {
          const qty = alloc.qty;
          const rate = item.rate;
          const price_list_rate = item.price_list_rate || rate;
          const discount_amount = price_list_rate - rate;

          return {
            ...baseItemFields,
            qty,
            rate,
            price_list_rate,
            discount_amount,
            amount: qty * rate,
            use_serial_batch_fields: (item.has_batch_no || item.has_serial_no) ? 1 : 0,
            ...(alloc.batch_no ? { batch_no: alloc.batch_no } : {}),
            ...(alloc.serial_no ? { serial_no: alloc.serial_no } : {}),
            ...(item.has_batch_no ? { has_batch_no: item.has_batch_no } : {}),
            ...(item.has_serial_no ? { has_serial_no: item.has_serial_no } : {}),
          };
        });
      } else {
        const rate = item.rate;
        const price_list_rate = item.price_list_rate || rate;
        const discount_amount = price_list_rate - rate;

        return [{
          ...baseItemFields,
          qty: item.qty,
          rate,
          price_list_rate,
          discount_amount,
          amount: item.qty * rate,
          use_serial_batch_fields: (item.has_batch_no || item.has_serial_no) ? 1 : 0,
          ...(item.batch_no ? { batch_no: item.batch_no } : {}),
          ...(item.serial_no ? { serial_no: item.serial_no } : {}),
          ...(item.has_batch_no ? { has_batch_no: item.has_batch_no } : {}),
          ...(item.has_serial_no ? { has_serial_no: item.has_serial_no } : {}),
        }];
      }
    }),
    payments: (() => {
      const allowPartial = session.allow_partial_payment === 1;
      let docPayments = payments
        .filter((p) => p.amount > 0)
        .map((p) => ({
          mode_of_payment: p.mode_of_payment,
          amount: p.amount,
        }));

      if (docPayments.length === 0 && allowPartial && payments.length > 0) {
        docPayments = [{
          mode_of_payment: payments[0].mode_of_payment,
          amount: 0,
        }];
      } else if (docPayments.length === 0 && allowPartial) {
        docPayments = [{
          mode_of_payment: 'Cash',
          amount: 0,
        }];
      }
      return docPayments;
    })(),
  };

  if (docTaxes.length > 0) {
    doc.taxes = docTaxes;
  }

  if (isPOSInvoice) {
    // POS Invoice needs the opening entry reference
    doc.pos_opening_entry = session.pos_opening;
  } else {
    // Sales Invoice with is_pos=1 ALSO requires pos_opening_entry
    // for ERPNext's validate_pos_opening_entry() check
    doc.pos_opening_entry = session.pos_opening;
    doc.is_created_using_pos = 1;
  }

  return doc;
}

// ─── Submit Invoice ───────────────────────────────────────────────────────────

export async function submitInvoice(payload: CreateInvoicePayload): Promise<{
  success: boolean;
  invoiceName?: string;
  localId?: number;
  offline?: boolean;
  error?: string;
  doc?: any;
}> {
  const doc = buildInvoiceDoc(payload);

  // Snapshot previous outstanding balance from IndexedDB BEFORE saving offline or updating customer balance
  if (doc.customer && doc.company && (doc.previous_outstanding === undefined || doc.previous_outstanding === null)) {
    try {
      const balanceRec = await getCachedPartyBalance(doc.company, 'Customer', doc.customer);
      if (balanceRec && balanceRec.party_current_balance !== undefined && balanceRec.party_current_balance !== null) {
        doc.previous_outstanding = balanceRec.party_current_balance;
      } else {
        const localBal = localStorage.getItem(`cached_balance_${doc.company}_${doc.customer}`);
        if (localBal !== null) doc.previous_outstanding = parseFloat(localBal) || 0;
      }
    } catch (e) {
      console.warn('[submitInvoice] Failed to fetch previous outstanding from IndexedDB:', e);
      const localBal = localStorage.getItem(`cached_balance_${doc.company}_${doc.customer}`);
      if (localBal !== null) doc.previous_outstanding = parseFloat(localBal) || 0;
    }
  }

  if (payload.isOnline) {
    try {
      // Step 1: Insert the document (applies all server-side defaults & validation)
      const insertedDoc = await call('frappe.client.insert', { doc });

      if (!insertedDoc || !insertedDoc.name) {
        throw new Error('Failed to create invoice — no document returned');
      }

      // Step 2: Submit the inserted document
      await call('frappe.client.submit', { doc: insertedDoc });

      return {
        success: true,
        invoiceName: insertedDoc.name,
        offline: false,
        doc: insertedDoc,
      };
    } catch (err: any) {
      const messages: string[] = err?.messages || [];
      const errorText = messages.length > 0
        ? messages.join('\n')
        : err?.message || 'Failed to submit invoice';

      // Check if it's a connection / network error to fallback to offline save
      const isConnectionError =
        err instanceof TypeError || // native fetch error like Failed to fetch
        errorText.includes('Failed to fetch') ||
        errorText.includes('NetworkError') ||
        errorText.includes('network') ||
        errorText.includes('timeout') ||
        !err.status ||
        err.status === 0 ||
        err.status === 408 ||
        err.status === 502 ||
        err.status === 503 ||
        err.status === 504;

      if (isConnectionError) {
        console.warn('[submitInvoice] Network/Server connection error detected. Falling back to offline save.', err);
        try {
          const localId = await saveDraftInvoice(doc);
          await addToSyncQueue('submit_invoice', { invoice: doc, local_id: localId });
          return {
            success: true,
            localId,
            offline: true,
            doc,
          };
        } catch (saveErr: any) {
          return {
            success: false,
            error: 'Network connection failed, and failed to save offline: ' + (saveErr?.message || 'Unknown save error'),
          };
        }
      }

      return {
        success: false,
        error: errorText,
      };
    }
  } else {
    // Offline path — save to IndexedDB + sync queue
    try {
      const localId = await saveDraftInvoice(doc);
      await addToSyncQueue('submit_invoice', { invoice: doc, local_id: localId });
      return {
        success: true,
        localId,
        offline: true,
        doc,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to save offline invoice',
      };
    }
  }
}

// ─── POS Session Helpers ─────────────────────────────────────────────────────

async function cachePrintStylesheets(htmlText?: string) {
  // 1. Resolve actual hashed URLs from assets.json manifest
  let printBundleUrl = '/assets/frappe/dist/css/print.bundle.css';
  let printFormatBundleUrl = '/assets/frappe/dist/css/print_format.bundle.css';
  let erpnextBundleUrl = '/assets/erpnext/dist/css/erpnext.bundle.css';

  try {
    const assetsResp = await fetch('/assets/assets.json');
    if (assetsResp.ok) {
      const assets = await assetsResp.json();
      if (assets['print.bundle.css']) {
        printBundleUrl = assets['print.bundle.css'];
      }
      if (assets['print_format.bundle.css']) {
        printFormatBundleUrl = assets['print_format.bundle.css'];
      }
      if (assets['erpnext.bundle.css']) {
        erpnextBundleUrl = assets['erpnext.bundle.css'];
      }
    }
  } catch (err) {
    console.warn('[PrintStyles] Failed to load assets.json manifest:', err);
  }

  const stylesToCache = [
    printBundleUrl,
    printFormatBundleUrl,
    erpnextBundleUrl,
  ];

  for (const url of stylesToCache) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const cssText = await resp.text();
        localStorage.setItem(`cached_css_${url}`, cssText);
        
        // Also cache under clean unhashed names for absolute fallback robustness
        const basename = url.split('/').pop() || '';
        localStorage.setItem(`cached_css_${basename}`, cssText);

        if (url.includes('print.bundle')) {
          localStorage.setItem('cached_css_/assets/frappe/dist/css/print.bundle.css', cssText);
          localStorage.setItem('cached_css_print.bundle.css', cssText);
          localStorage.setItem('cached_css_/assets/frappe/css/bootstrap.css', cssText);
          localStorage.setItem('cached_css_bootstrap.css', cssText);
        } else if (url.includes('print_format.bundle')) {
          localStorage.setItem('cached_css_/assets/frappe/dist/css/print_format.bundle.css', cssText);
          localStorage.setItem('cached_css_print_format.bundle.css', cssText);
          localStorage.setItem('cached_css_/assets/frappe/css/printview.css', cssText);
          localStorage.setItem('cached_css_printview.css', cssText);
        } else if (url.includes('erpnext.bundle')) {
          localStorage.setItem('cached_css_/assets/erpnext/dist/css/erpnext.bundle.css', cssText);
          localStorage.setItem('cached_css_erpnext.bundle.css', cssText);
        }
      }
    } catch (e) {
      console.warn('[PrintStyles] Failed to cache fallback CSS:', url, e);
    }
  }

  // 2. Dynamic links from HTML template
  if (htmlText) {
    try {
      const parser = new DOMParser();
      const docDom = parser.parseFromString(htmlText, 'text/html');
      const links = docDom.querySelectorAll('link[rel="stylesheet"]');
      for (const link of Array.from(links)) {
        const href = link.getAttribute('href');
        if (href) {
          try {
            const resp = await fetch(href);
            if (resp.ok) {
              const cssText = await resp.text();
              localStorage.setItem(`cached_css_${href}`, cssText);
              
              // Also cache normalized pathname for robustness
              try {
                const cleanHref = href.startsWith('http') ? new URL(href).pathname : href;
                localStorage.setItem(`cached_css_${cleanHref}`, cssText);
              } catch (cleanErr) {}
            }
          } catch (e) {
            console.warn('[PrintStyles] Failed to cache CSS from URL:', href, e);
          }
        }
      }
    } catch (err) {
      console.warn('[PrintStyles] Error parsing and caching stylesheets:', err);
    }
  }
}

export async function getPOSProfileData(posProfile: string): Promise<any> {
  // Pre-populate IndexedDB with local static templates
  for (const [name, data] of Object.entries(STATIC_TEMPLATES)) {
    try {
      await cachePrintFormat(name, data);
    } catch (e) {
      console.warn('[InvoiceService] Failed to pre-populate static print format:', name, e);
    }
  }

  try {
    const data = await call(
      'erpnext.selling.page.point_of_sale.point_of_sale.get_pos_profile_data',
      { pos_profile: posProfile }
    );
    if (data) {
      if (!data.name) {
        data.name = posProfile;
      }
      await cachePOSProfile(data);

      if (data.company) {
        try {
          const companyDoc = await call('frappe.client.get', {
            doctype: 'Company',
            name: data.company
          });
          if (companyDoc) {
            // Convert company_logo to Base64 data URL for offline rendering
            if (companyDoc.company_logo) {
              try {
                const logoUrl = companyDoc.company_logo.startsWith('http')
                  ? companyDoc.company_logo
                  : `${window.location.origin}${companyDoc.company_logo}`;
                const imgResp = await fetch(logoUrl);
                if (imgResp.ok) {
                  const blob = await imgResp.blob();
                  const base64Data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                  });
                  companyDoc.company_logo = base64Data;
                  localStorage.setItem('cached_company_logo', base64Data);
                }
              } catch (logoErr) {
                console.warn('[InvoiceService] Failed to base64 encode company logo:', logoErr);
              }
            }
            await cachePrintFormat('Company_Doc', companyDoc);
            localStorage.setItem('cached_company_doc', JSON.stringify(companyDoc));
          }
        } catch (compErr) {
          console.warn('[InvoiceService] Failed to fetch/cache Company doc:', compErr);
        }

        try {
          let addressName: any = await call('frappe.client.get_value', {
            doctype: 'Address',
            filters: { is_your_company_address: 1 },
            fieldname: 'name'
          });
          if (addressName && typeof addressName === 'object') {
            addressName = addressName.name || addressName.message;
          }
          if (!addressName) {
            addressName = await call('frappe.client.get_value', {
              doctype: 'Address',
              filters: {
                'links.link_doctype': 'Company',
                'links.link_name': data.company
              },
              fieldname: 'name'
            });
            if (addressName && typeof addressName === 'object') {
              addressName = addressName.name || addressName.message;
            }
          }
          if (addressName) {
            const addressDoc = await call('frappe.client.get', {
              doctype: 'Address',
              name: addressName
            });
            if (addressDoc) {
              await cachePrintFormat('Address_Doc', addressDoc);
              localStorage.setItem('cached_address_doc', JSON.stringify(addressDoc));
            }
          }
        } catch (addrErr) {
          console.warn('[InvoiceService] Failed to fetch/cache Company Address doc:', addrErr);
        }
      }

      if (data.pos_print_format) {
        try {
          const pfData = await call(
            'offline_pos.api.get_print_format_template',
            { print_format: data.pos_print_format, doctype: 'POS Invoice' }
          );
          if (pfData) {
            localStorage.setItem(`print_format_${data.pos_print_format}`, JSON.stringify(pfData));
            await cachePrintFormat(data.pos_print_format, pfData);
            await cachePrintStylesheets(pfData.html);
          } else {
            await cachePrintStylesheets();
          }
        } catch (pfErr) {
          console.warn('[InvoiceService] Failed to cache pos_print_format template:', pfErr);
        }
      }

      if (data.standard_print_format) {
        try {
          const pfData = await call(
            'offline_pos.api.get_print_format_template',
            { print_format: data.standard_print_format, doctype: 'POS Invoice' }
          );
          if (pfData) {
            localStorage.setItem(`print_format_${data.standard_print_format}`, JSON.stringify(pfData));
            await cachePrintFormat(data.standard_print_format, pfData);
            await cachePrintStylesheets(pfData.html);
          }
        } catch (pfErr) {
          console.warn('[InvoiceService] Failed to cache standard_print_format template:', pfErr);
        }
      }
    }
    return data;
  } catch (err) {
    console.warn('[InvoiceService] getPOSProfileData failed. Trying offline cache...', err);
    const cached = await getCachedPOSProfile(posProfile);
    if (cached) {
      return cached;
    }
    throw err;
  }
}

export async function checkOpeningEntry(user: string): Promise<any[]> {
  const result = await call(
    'erpnext.selling.page.point_of_sale.point_of_sale.check_opening_entry',
    { user }
  );
  return result || [];
}

export async function createOpeningVoucher(
  posProfile: string,
  company: string,
  balanceDetails: Array<{ mode_of_payment: string; opening_amount: number }>
): Promise<any> {
  return call(
    'erpnext.selling.page.point_of_sale.point_of_sale.create_opening_voucher',
    {
      pos_profile: posProfile,
      company,
      // ERPNext backend does json.loads(balance_details) — must send as JSON string
      balance_details: JSON.stringify(balanceDetails),
    }
  );
}

export async function getPastOrders(
  searchTerm: string = '',
  status: string = 'Draft',
  limit: number = 20
): Promise<any[]> {
  const result = await call(
    'erpnext.selling.page.point_of_sale.point_of_sale.get_past_order_list',
    { search_term: searchTerm, status, limit }
  );
  return result || [];
}
function numberToWords(amount: number, currencyCode: string = 'NGN'): string {
  const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const scales = ["", "Thousand", "Million", "Billion"];

  function convertSection(num: number): string {
    let str = "";
    if (num >= 100) {
      str += units[Math.floor(num / 100)] + " Hundred ";
      num %= 100;
    }
    if (num >= 20) {
      str += tens[Math.floor(num / 10)] + " ";
      num %= 10;
    }
    if (num > 0) {
      str += units[num] + " ";
    }
    return str.trim();
  }

  const mainUnit = Math.floor(amount);
  const subUnit = Math.round((amount - mainUnit) * 100);

  let currencyName = "Naira";
  let subCurrencyName = "Kobo";
  
  if (currencyCode === 'BDT') {
    currencyName = "Taka";
    subCurrencyName = "Poisha";
  } else if (currencyCode === 'USD') {
    currencyName = "Dollars";
    subCurrencyName = "Cents";
  } else if (currencyCode === 'EUR') {
    currencyName = "Euros";
    subCurrencyName = "Cents";
  } else if (currencyCode === 'GBP') {
    currencyName = "Pounds";
    subCurrencyName = "Pence";
  } else if (currencyCode && currencyCode !== 'NGN') {
    currencyName = currencyCode;
    subCurrencyName = "Cent";
  }

  if (mainUnit === 0 && subUnit === 0) return `Zero ${currencyName} Only`;

  let words = "";
  if (mainUnit > 0) {
    let tempMain = mainUnit;
    let scaleIdx = 0;
    let parts: string[] = [];
    while (tempMain > 0) {
      const part = tempMain % 1000;
      if (part > 0) {
        let partStr = convertSection(part);
        if (scales[scaleIdx]) {
          partStr += " " + scales[scaleIdx];
        }
        parts.unshift(partStr);
      }
      tempMain = Math.floor(tempMain / 1000);
      scaleIdx++;
    }
    words += parts.join(", ") + " " + currencyName;
  }

  if (subUnit > 0) {
    if (words) words += " and ";
    words += convertSection(subUnit) + " " + subCurrencyName;
  }

  return words ? words + " Only" : "";
}

function wrapDocForJinja(originalDoc: any, currencyCode: string) {
  const wrapped = { ...originalDoc };

  const getFormattedValue = (val: any) => {
    if (typeof val === 'number') {
      return formatWithCurrencySymbol(val, currencyCode);
    }
    return val !== undefined && val !== null ? String(val) : '';
  };

  wrapped.get_formatted = function(fieldname: string) {
    return getFormattedValue(this[fieldname]);
  };

  if (Array.isArray(wrapped.items)) {
    wrapped.items = wrapped.items.map((item: any, idx: number) => {
      const wrappedItem = { 
        ...item, 
        idx: idx + 1
      };
      wrappedItem.get_formatted = function(fieldname: string) {
        return getFormattedValue(this[fieldname]);
      };
      return wrappedItem;
    });
  }

  if (Array.isArray(wrapped.taxes)) {
    wrapped.taxes = wrapped.taxes.map((tax: any) => {
      const wrappedTax = { ...tax };
      wrappedTax.get_formatted = function(fieldname: string) {
        return getFormattedValue(this[fieldname]);
      };
      return wrappedTax;
    });
  }

  if (Array.isArray(wrapped.payments)) {
    wrapped.payments = wrapped.payments.map((payment: any) => {
      const wrappedPayment = { ...payment };
      wrappedPayment.get_formatted = function(fieldname: string) {
        return getFormattedValue(this[fieldname]);
      };
      return wrappedPayment;
    });
  }

  return wrapped;
}

export async function printInvoiceOffline(doc: any, pfData: any, preOpenedWindow?: Window | null, useIframe: boolean = false, isPOS: boolean = false) {
  let printWindow: Window | null = null;
  let printIframe: HTMLIFrameElement | null = null;

  if (useIframe) {
    const oldIframe = document.getElementById('pos-print-iframe');
    if (oldIframe) {
      oldIframe.remove();
    }
    printIframe = document.createElement('iframe');
    printIframe.id = 'pos-print-iframe';
    printIframe.style.position = 'fixed';
    printIframe.style.width = '0px';
    printIframe.style.height = '0px';
    printIframe.style.border = 'none';
    printIframe.style.bottom = '0px';
    printIframe.style.right = '0px';
    document.body.appendChild(printIframe);
  } else {
    printWindow = preOpenedWindow || window.open('', '_blank');
    if (!printWindow) return;
  }

  const targetWindow = useIframe ? printIframe?.contentWindow : printWindow;
  if (!targetWindow) return;

  const targetDocument = targetWindow.document;

  const company = doc.company || '';
  const name = doc.name || doc.invoiceName || doc.custom_offline_id || '';
  const date = doc.posting_date || new Date().toISOString().split('T')[0];
  const time = doc.posting_time || new Date().toLocaleTimeString('en-US', { hour12: false });
  const customer = doc.customer || '';
  const customerName = doc.customer_name || doc.customer || '';
  const items = doc.items || [];
  
  const formatCurrency = (val: number) => {
    return formatNumber(val);
  };

  const subtotal = doc.net_total || 0;
  const discount = doc.discount_amount || 0;
  const grandTotal = doc.grand_total || 0;
  const paidAmount = (doc.paid_amount !== undefined && doc.paid_amount !== null) ? doc.paid_amount : grandTotal;

  // Retrieve cached outstanding balance for customer from IndexedDB (with localStorage fallback)
  let prevOutstandingVal = 0;
  if (customer && company) {
    try {
      const balanceRec = await getCachedPartyBalance(company, 'Customer', customer);
      if (balanceRec && balanceRec.party_current_balance !== undefined && balanceRec.party_current_balance !== null) {
        prevOutstandingVal = balanceRec.party_current_balance;
      } else {
        const localBal = localStorage.getItem(`cached_balance_${company}_${customer}`);
        if (localBal !== null) prevOutstandingVal = parseFloat(localBal) || 0;
      }
    } catch (e) {
      console.warn('[printInvoiceOffline] Failed to get cached party balance:', e);
      const localBal = localStorage.getItem(`cached_balance_${company}_${customer}`);
      if (localBal !== null) prevOutstandingVal = parseFloat(localBal) || 0;
    }
  }

  if (doc.previous_outstanding === undefined || doc.previous_outstanding === null) {
    doc.previous_outstanding = prevOutstandingVal;
  }

  // Calculate previous outstanding, total due, and current due
  const invoiceOutstanding = grandTotal - paidAmount;
  const previousOutstanding = prevOutstandingVal - invoiceOutstanding;
  const totalDue = previousOutstanding + grandTotal;
  const currentDue = totalDue - paidAmount;

  let docCurrency = doc.currency;
  if (!docCurrency) {
    try {
      const sessionStr = localStorage.getItem('pos_session');
      if (sessionStr) {
        const sessionData = JSON.parse(sessionStr);
        docCurrency = sessionData?.currency;
      }
    } catch (e) {
      console.warn('[printInvoiceOffline] Failed to read pos_session from localStorage:', e);
    }
  }
  if (!docCurrency && doc.pos_profile) {
    try {
      const profile = await getCachedPOSProfile(doc.pos_profile);
      docCurrency = profile?.currency;
    } catch (e) {
      console.warn('[printInvoiceOffline] Failed to read cached POS profile:', e);
    }
  }
  if (!docCurrency) {
    docCurrency = localStorage.getItem('pos_system_currency') || 'BDT';
  }

  // Render using cached HTML print format layout if available
  if (pfData && pfData.html) {
    try {
      // 1. Fetch Company doc and Company Address doc from IndexedDB (with localStorage fallbacks)
      let cachedCompanyDoc: any = null;
      let cachedAddressDoc: any = null;
      try {
        cachedCompanyDoc = await getCachedPrintFormat('Company_Doc');
        if (!cachedCompanyDoc) {
          const localComp = localStorage.getItem('cached_company_doc');
          if (localComp) cachedCompanyDoc = JSON.parse(localComp);
        }

        cachedAddressDoc = await getCachedPrintFormat('Address_Doc');
        if (!cachedAddressDoc) {
          const localAddr = localStorage.getItem('cached_address_doc');
          if (localAddr) cachedAddressDoc = JSON.parse(localAddr);
        }
      } catch (e) {
        console.warn('[printInvoiceOffline] Error loading cached Company/Address doc:', e);
      }
      if (!cachedCompanyDoc) {
        cachedCompanyDoc = {
          name: company,
          company_logo: '',
          tax_id: '',
          phone_no: '',
          email: ''
        };
      }
      if (!cachedAddressDoc) {
        cachedAddressDoc = {
          address_line1: '',
          address_line2: '',
          city: '',
          country: ''
        };
      }

      // 2. Prepare rendering context
      const renderingDoc = wrapDocForJinja({
        ...doc,
        company,
        name,
        posting_date: date,
        posting_time: time,
        customer,
        customer_name: customerName,
        net_total: subtotal,
        total: subtotal,
        grand_total: grandTotal,
        paid_amount: paidAmount,
        discount_amount: discount,
        outstanding_amount: invoiceOutstanding,
        previous_outstanding: doc.previous_outstanding !== undefined && doc.previous_outstanding !== null ? doc.previous_outstanding : prevOutstandingVal,
        rounded_total: grandTotal,
        total_qty: items.reduce((sum: number, item: any) => sum + (item.qty || 0), 0),
        in_words: numberToWords(grandTotal, docCurrency),
        currency: docCurrency,
        custom_prev_outstanding: previousOutstanding,
        custom_total_due: totalDue,
        custom_curr_due: currentDue,
        company_address: doc.company_address || (cachedAddressDoc ? cachedAddressDoc.name : 'Address_Doc'),
        customer_address: doc.customer_address || 'Customer_Address_Doc',
        owner: doc.owner || localStorage.getItem('user_id') || 'Guest',
      }, docCurrency);

      // 3. Initialize Nunjucks environment with autoescaping disabled
      const env = new nunjucks.Environment(null, { autoescape: false });

      env.addGlobal('_', (str: string) => str);
      env.addFilter('_', (str: string) => str);
      env.addGlobal('get_customer_outstanding', (cust: string, comp: string) => {
        return prevOutstandingVal;
      });
      env.addGlobal('letter_head', '');

      const frappeMock = {
        format: (val: any, options: any) => {
          if (options && (options === 'Currency' || options.fieldtype === 'Currency')) {
            return formatWithCurrencySymbol(val, docCurrency);
          }
          return String(val);
        },
        get_doc: (doctype: string, docname: string) => {
          if (doctype === 'Company') return cachedCompanyDoc;
          if (doctype === 'Address') {
            if (docname === renderingDoc.company_address || docname === 'Address_Doc' || docname === cachedAddressDoc.name) {
              return cachedAddressDoc;
            }
            return {
              address_line1: '',
              address_line2: '',
              city: '',
              country: ''
            };
          }
          return {};
        },
        utils: {
          now_datetime: () => {
            const now = new Date();
            return {
              strftime: (fmt: string) => {
                const d = String(now.getDate()).padStart(2, '0');
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const b = monthNames[now.getMonth()];
                const y = String(now.getFullYear()).slice(-2);
                const hours = now.getHours();
                const ampm = hours >= 12 ? 'PM' : 'AM';
                const formattedHours = String(hours % 12 || 12).padStart(2, '0');
                const M = String(now.getMinutes()).padStart(2, '0');
                return fmt
                  .replace('%d', d)
                  .replace('%b', b)
                  .replace('%y', y)
                  .replace('%I', formattedHours)
                  .replace('%M', M)
                  .replace('%p', ampm);
              }
            };
          }
        }
      };
      env.addGlobal('frappe', frappeMock);

      // Preprocess template to make Python Jinja syntax compatible with Nunjucks:
      let templateHtml = pfData.html || '';

      // 1. Preprocess inline if-else inside {% set var = expr1 if cond else expr2 %}
      // Regex: {%\s*set\s+(\w+)\s*=\s*(.*?)\s+if\s+(.*?)\s+else\s+(.*?)\s*%}
      templateHtml = templateHtml.replace(/\{%\s*set\s+(\w+)\s*=\s*(.*?)\s+if\s+(.*?)\s+else\s+(.*?)\s*%\}/g, (match, variable, expr1, cond, expr2) => {
        return `{% if ${cond} %}{% set ${variable} = ${expr1} %}{% else %}{% set ${variable} = ${expr2} %}{% endif %}`;
      });

      // 2. Replace Python Jinja concatenation `~` with `+` inside {{ ... }} and {% ... %}
      templateHtml = templateHtml.replace(/(\{\{[^}]*\}\}|\{\%[^%]*\%\})/g, (match) => {
        return match.replace(/~/g, '+');
      });

      // 4. Render Nunjucks template
      let renderedHtml = '';
      try {
        renderedHtml = env.renderString(templateHtml, { doc: renderingDoc });
      } catch (renderErr) {
        console.warn('[printInvoiceOffline] Nunjucks rendering failed, falling back to raw html:', renderErr);
        renderedHtml = pfData.html;
      }

      // Parse the HTML DOM to perform inline stylesheet replacement
      const parser = new DOMParser();
      const docDom = parser.parseFromString(renderedHtml, 'text/html');

      // Ensure base tag is injected into head to resolve relative assets (e.g. logo images)
      let baseTag = docDom.querySelector('base');
      if (!baseTag) {
        baseTag = docDom.createElement('base');
        baseTag.setAttribute('href', window.location.origin);
        if (docDom.head) {
          docDom.head.insertBefore(baseTag, docDom.head.firstChild);
        }
      }

      // If there is no .print-format wrapper, wrap body contents
      if (!docDom.querySelector('.print-format')) {
        const bodyContent = docDom.body.innerHTML;
        docDom.body.innerHTML = `
          <div class="print-format-container">
            <div class="print-format">
              ${bodyContent}
            </div>
          </div>
        `;
      }

      // Ensure standard stylesheets are injected into head
      const standardStylesheets = [
        '/assets/frappe/dist/css/print.bundle.css',
        '/assets/frappe/dist/css/print_format.bundle.css',
        '/assets/erpnext/dist/css/erpnext.bundle.css',
        '/assets/frappe/css/bootstrap.css',
        '/assets/frappe/css/printview.css'
      ];
      standardStylesheets.forEach((url) => {
        const cachedCss = localStorage.getItem(`cached_css_${url}`);
        if (cachedCss) {
          const styleTag = docDom.createElement('style');
          styleTag.setAttribute('data-source', url);
          styleTag.textContent = cachedCss;
          docDom.head.appendChild(styleTag);
        }
      });

      // Inject custom format CSS if available
      if (pfData.css) {
        const customStyle = docDom.createElement('style');
        customStyle.setAttribute('data-source', 'custom-css');
        customStyle.textContent = pfData.css;
        docDom.head.appendChild(customStyle);
      }

      // Inject CSS override to reset margins and widths for thermal POS printing
      const formatIsPOS = isPOS || pfData?.name?.toLowerCase().includes('pos') || !pfData?.name;
      if (formatIsPOS) {
        const posStyle = docDom.createElement('style');
        posStyle.setAttribute('data-source', 'pos-print-override');
        posStyle.textContent = `
          @media print {
            html, body, .print-format-container, .print-format-gutter, .print-format {
              width: 100% !important;
              max-width: 100% !important;
              min-width: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              background: transparent !important;
            }
            .print-format {
              border: none !important;
              box-shadow: none !important;
            }
            /* Reset bootstrap grid and container padding/margin for small receipt width */
            .container, .container-fluid, .row {
              width: 100% !important;
              max-width: 100% !important;
              min-width: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            /* Clear columns padding so table contents fill the width */
            .col-xs-1, .col-xs-2, .col-xs-3, .col-xs-4, .col-xs-5, .col-xs-6,
            .col-xs-7, .col-xs-8, .col-xs-9, .col-xs-10, .col-xs-11, .col-xs-12 {
              padding-left: 0 !important;
              padding-right: 0 !important;
            }
            @page {
              size: auto;
              margin: 0mm !important;
            }
          }
        `;
        docDom.head.appendChild(posStyle);
      }

      // Inline cached stylesheets from links (if any exist in the template HTML)
      const links = docDom.querySelectorAll('link[rel="stylesheet"]');
      links.forEach((link: any) => {
        const href = link.getAttribute('href');
        if (href) {
          let cachedCss = localStorage.getItem(`cached_css_${href}`);
          if (!cachedCss && href.startsWith('http')) {
            try {
              const pathname = new URL(href).pathname;
              cachedCss = localStorage.getItem(`cached_css_${pathname}`);
            } catch (urlErr) {}
          }
          if (!cachedCss && !href.startsWith('/')) {
            cachedCss = localStorage.getItem(`cached_css_/${href}`);
          }
          if (cachedCss) {
            const styleTag = docDom.createElement('style');
            styleTag.textContent = cachedCss;
            link.replaceWith(styleTag);
          }
        }
      });

      let finalHtml = docDom.documentElement.outerHTML;

      // 5. Ensure automatic print triggering script is injected
      const closeScript = useIframe ? `
        <script>
          function doPrint() {
            window.focus();
            window.print();
          }
          setTimeout(doPrint, 500);
        </script>
      ` : `
        <script>
          function doPrint() {
            window.focus();
            window.print();
          }
          window.addEventListener('afterprint', function() {
            window.close();
          });
          setTimeout(doPrint, 500);
        </script>
      `;

      if (finalHtml.includes('</body>')) {
        finalHtml = finalHtml.replace('</body>', closeScript + '</body>');
      } else {
        finalHtml += closeScript;
      }

      targetDocument.open();
      targetDocument.write(finalHtml);
      targetDocument.close();

      if (useIframe && printIframe) {
        targetWindow.addEventListener('afterprint', () => {
          printIframe?.remove();
        });
      }
      return;
    } catch (e) {
      console.warn('[InvoiceService] Failed to render cached HTML print format, falling back to basic layout:', e);
    }
  }

  // --- FALLBACK STANDARD THERMAL RECEIPT ---
  let itemsHtml = '';
  items.forEach((item: any) => {
    itemsHtml += `
      <tr>
        <td style="padding: 6px 0; border-bottom: 1px dashed #eee;">
          <div style="font-weight: bold; font-size: 13px;">${item.item_name}</div>
          <div style="font-size: 11px; color: #666;">${item.item_code}</div>
        </td>
        <td style="text-align: right; padding: 6px 0; border-bottom: 1px dashed #eee; font-size: 13px;">${item.qty} ${item.uom || ''}</td>
        <td style="text-align: right; padding: 6px 0; border-bottom: 1px dashed #eee; font-size: 13px;">${formatCurrency(item.rate)}</td>
        <td style="text-align: right; padding: 6px 0; border-bottom: 1px dashed #eee; font-size: 13px; font-weight: bold;">${formatCurrency(item.qty * item.rate)}</td>
      </tr>
    `;
  });

  let taxesHtml = '';
  if (doc.taxes && doc.taxes.length > 0) {
    doc.taxes.forEach((tax: any) => {
      const amt = tax.tax_amount || 0;
      if (amt > 0 || tax.rate > 0) {
        taxesHtml += `
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
            <span>${tax.description || tax.account_head}</span>
            <span>${amt > 0 ? formatCurrency(amt) : tax.rate + '%'}</span>
          </div>
        `;
      }
    });
  }

  let paymentsHtml = '';
  if (doc.payments && doc.payments.length > 0) {
    doc.payments.forEach((pay: any) => {
      paymentsHtml += `
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
          <span>${pay.mode_of_payment}</span>
          <span style="font-weight: bold;">${formatCurrency(pay.amount)}</span>
        </div>
      `;
    });
  }

  const customCSS = pfData?.css || '';

  const closeScriptFallback = useIframe ? `
    <script>
      function doPrint() {
        window.focus();
        window.print();
      }
      setTimeout(doPrint, 500);
    </script>
  ` : `
    <script>
      function doPrint() {
        window.focus();
        window.print();
      }
      window.addEventListener('afterprint', function() {
        window.close();
      });
      setTimeout(doPrint, 500);
    </script>
  `;

  const html = `
    <html>
      <head>
        <title>Receipt - ${name}</title>
        <style>
          @media print {
            body { margin: 0; padding: 10px; }
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            color: #000;
            max-width: 80mm;
            margin: 0 auto;
            padding: 10px;
          }
          .receipt-header {
            text-align: center;
            margin-bottom: 15px;
          }
          .receipt-title {
            font-size: 16px;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 5px;
          }
          .receipt-info {
            font-size: 11px;
            margin-bottom: 15px;
            line-height: 1.4;
          }
          .receipt-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          .receipt-divider {
            border-top: 1px dashed #000;
            margin: 10px 0;
          }
          .receipt-totals {
            margin-bottom: 15px;
          }
          .receipt-footer {
            text-align: center;
            font-size: 11px;
            margin-top: 20px;
            color: #666;
          }
          ${customCSS}
        </style>
      </head>
      <body>
        <div class="receipt-header">
          <div class="receipt-title">${company}</div>
          <div style="font-size: 12px; font-weight: bold; margin-top: 4px;">${pfData?.name || 'POS Receipt'}</div>
        </div>

        <div class="receipt-info">
          <div><strong>Receipt #:</strong> ${name} (OFFLINE)</div>
          <div><strong>Date:</strong> ${date} ${time}</div>
          <div><strong>Customer:</strong> ${customer}</div>
        </div>

        <table class="receipt-table">
          <thead>
            <tr style="border-bottom: 1px solid #000; font-size: 11px;">
              <th style="text-align: left; padding-bottom: 5px;">Item</th>
              <th style="text-align: right; padding-bottom: 5px;">Qty</th>
              <th style="text-align: right; padding-bottom: 5px;">Rate</th>
              <th style="text-align: right; padding-bottom: 5px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="receipt-totals">
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
            <span>Subtotal</span>
            <span>${formatCurrency(subtotal)}</span>
          </div>
          ${discount > 0 ? `
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; font-weight: bold; color: red;">
            <span>Discount</span>
            <span>-${formatCurrency(discount)}</span>
          </div>
          ` : ''}
          ${taxesHtml}
          <div class="receipt-divider"></div>
          <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin-bottom: 10px;">
            <span>Grand Total</span>
            <span>${formatCurrency(grandTotal)}</span>
          </div>
        </div>

        <div class="receipt-info">
          <div style="font-weight: bold; font-size: 12px; margin-bottom: 5px;">Payment Details:</div>
          ${paymentsHtml}
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-footer">
          <div>Thank you for your business!</div>
          <div style="margin-top: 5px; font-size: 9px; color: #999;">Offline Transaction - Will sync automatically when online.</div>
        </div>

        ${closeScriptFallback}
      </body>
    </html>
  `;

  targetDocument.open();
  targetDocument.write(html);
  targetDocument.close();

  if (useIframe && printIframe) {
    targetWindow.addEventListener('afterprint', () => {
      printIframe?.remove();
    });
  }
}

const STATIC_TEMPLATES: Record<string, any> = {
  'POS Print Format': posPrintFormat,
  'Standard Print format': standardPrintFormat,
};

export async function resolvePrintFormat(formatName: string): Promise<any> {
  if (!formatName) return { name: '' };

  // 1. Try IndexedDB
  try {
    const cached = await getCachedPrintFormat(formatName);
    if (cached) {
      return cached;
    }
  } catch (err) {
    console.warn('[resolvePrintFormat] IndexedDB error:', err);
  }

  // 2. Try legacy localStorage
  const legacy = localStorage.getItem(`print_format_${formatName}`);
  if (legacy) {
    try {
      const data = JSON.parse(legacy);
      // Save it to IndexedDB to migrate it
      await cachePrintFormat(formatName, data);
      return data;
    } catch (e) {}
  }

  // 3. Match static templates by name
  const matchedKey = Object.keys(STATIC_TEMPLATES).find(
    (key) => key.toLowerCase() === formatName.toLowerCase()
  );
  if (matchedKey) {
    return STATIC_TEMPLATES[matchedKey];
  }

  // 4. Match static templates by keywords fallback
  const lowerName = formatName.toLowerCase();
  if (lowerName.includes('offline') && lowerName.includes('standard')) {
    return STATIC_TEMPLATES['Offline Standard Print Format'];
  } else if (lowerName.includes('offline')) {
    return STATIC_TEMPLATES['Offline POS Print Format'];
  } else if (lowerName.includes('standard')) {
    return STATIC_TEMPLATES['Standard Print format'];
  }

  // Final fallback
  return STATIC_TEMPLATES['POS Print Format'];
}

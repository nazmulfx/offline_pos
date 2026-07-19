/**
 * invoiceService.ts — Create, save, submit POS Invoices
 * Supports both 'POS Invoice' and 'Sales Invoice' based on POS Settings.
 * Online: frappe.client.insert + frappe.client.submit
 * Offline: save to IndexedDB + sync_queue
 */
import call from '../lib/call';
import { saveDraftInvoice, addToSyncQueue, cachePOSProfile, getCachedPOSProfile, getCachedPartyBalance } from '../db/posDB';
import type { CartItem, Customer, POSSession } from '../stores/posStore';
import { formatNumber, formatCurrency as formatWithCurrencySymbol } from '../lib/currency';

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
  // 1. Static fallback defaults
  const stylesToCache = [
    '/assets/frappe/css/bootstrap.css',
    '/assets/frappe/css/printview.css',
  ];
  for (const url of stylesToCache) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const cssText = await resp.text();
        localStorage.setItem(`cached_css_${url}`, cssText);
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

      if (data.print_format) {
        try {
          const pfData = await call(
            'offline_pos.api.get_print_format_template',
            { print_format: data.print_format, doctype: 'POS Invoice' }
          );
          if (pfData) {
            localStorage.setItem(`print_format_${data.print_format}`, JSON.stringify(pfData));
            await cachePrintStylesheets(pfData.html);
          } else {
            await cachePrintStylesheets();
          }
        } catch (pfErr) {
          console.warn('[InvoiceService] Failed to cache print format template:', pfErr);
        }
      }

      if (data.custom_offline_print_format) {
        try {
          const pfData = await call(
            'offline_pos.api.get_print_format_template',
            { print_format: data.custom_offline_print_format, doctype: 'POS Invoice' }
          );
          if (pfData) {
            localStorage.setItem(`print_format_${data.custom_offline_print_format}`, JSON.stringify(pfData));
            await cachePrintStylesheets(pfData.html);
          }
        } catch (pfErr) {
          console.warn('[InvoiceService] Failed to cache custom offline print format template:', pfErr);
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
            await cachePrintStylesheets(pfData.html);
          }
        } catch (pfErr) {
          console.warn('[InvoiceService] Failed to cache standard print format template:', pfErr);
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

export async function printInvoiceOffline(doc: any, pfData: any, preOpenedWindow?: Window | null, useIframe: boolean = false) {
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
  const name = doc.name || doc.invoiceName || '';
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

  // Retrieve cached outstanding balance for customer from IndexedDB
  let prevOutstandingVal = 0;
  if (customer && company) {
    try {
      const balanceRec = await getCachedPartyBalance(company, 'Customer', customer);
      if (balanceRec) {
        prevOutstandingVal = balanceRec.party_current_balance || 0;
      }
    } catch (e) {
      console.warn('[printInvoiceOffline] Failed to get cached party balance:', e);
    }
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
      const parser = new DOMParser();
      const docDom = parser.parseFromString(pfData.html, 'text/html');

      // 1. Walk the tree to locate the item row placeholder ___ITEM_NAME___
      const walker = docDom.createTreeWalker(docDom.body, NodeFilter.SHOW_TEXT);
      let itemRow: HTMLElement | null = null;
      let node: Node | null;
      while (node = walker.nextNode()) {
        if (node.nodeValue && node.nodeValue.includes('___ITEM_NAME___')) {
          let parent = node.parentElement;
          while (parent) {
            if (
              parent.tagName === 'TR' ||
              parent.tagName === 'LI' ||
              parent.classList.contains('row') ||
              parent.classList.contains('print-format-row')
            ) {
              break;
            }
            if (parent.tagName === 'BODY' || parent.id === 'print-format') {
              break;
            }
            parent = parent.parentElement;
          }
          itemRow = parent;
          break;
        }
      }

      if (itemRow && itemRow.parentElement) {
        const parentContainer = itemRow.parentElement;
        const rowTemplate = itemRow.cloneNode(true) as HTMLElement;
        const nextSibling = itemRow.nextSibling;
        
        // Remove template placeholder row
        itemRow.remove();

        // Multiply rows for each item in the cart
        items.forEach((item: any) => {
          const newRow = rowTemplate.cloneNode(true) as HTMLElement;
          let rowHtml = newRow.innerHTML;
          
          rowHtml = rowHtml.replace(/___ITEM_NAME___/g, item.item_name || '');
          rowHtml = rowHtml.replace(/___ITEM_CODE___/g, item.item_code || '');
          rowHtml = rowHtml.replace(/___ITEM_UOM___/g, item.uom || '');
          rowHtml = rowHtml.replace(/88888\.88/g, String(item.conversion_factor || 1));
          rowHtml = rowHtml.replace(/999\.99/g, String(item.qty));
          rowHtml = rowHtml.replace(/999,?111\.11/g, formatCurrency(item.rate));
          rowHtml = rowHtml.replace(/999,?222\.22/g, formatCurrency(item.qty * item.rate));
          
          newRow.innerHTML = rowHtml;
          if (nextSibling) {
            parentContainer.insertBefore(newRow, nextSibling);
          } else {
            parentContainer.appendChild(newRow);
          }
        });
      }

      // 1b. Walk the tree to locate the payment row placeholder ___MODE_OF_PAYMENT___
      const pWalker = docDom.createTreeWalker(docDom.body, NodeFilter.SHOW_TEXT);
      let paymentRow: HTMLElement | null = null;
      let pNode: Node | null;
      while (pNode = pWalker.nextNode()) {
        if (pNode.nodeValue && pNode.nodeValue.includes('___MODE_OF_PAYMENT___')) {
          let parent = pNode.parentElement;
          while (parent) {
            if (
              parent.tagName === 'TR' ||
              parent.tagName === 'LI' ||
              parent.classList.contains('row') ||
              parent.classList.contains('print-format-row')
            ) {
              break;
            }
            if (parent.tagName === 'BODY' || parent.id === 'print-format') {
              break;
            }
            parent = parent.parentElement;
          }
          paymentRow = parent;
          break;
        }
      }

      if (paymentRow && paymentRow.parentElement) {
        const parentContainer = paymentRow.parentElement;
        const rowTemplate = paymentRow.cloneNode(true) as HTMLElement;
        const nextSibling = paymentRow.nextSibling;
        
        // Remove template placeholder row
        paymentRow.remove();

        // Multiply rows for each payment with amount > 0
        const paymentsList = (doc.payments || []).filter((p: any) => (p.amount || 0) > 0);
        paymentsList.forEach((pay: any) => {
          const newRow = rowTemplate.cloneNode(true) as HTMLElement;
          let rowHtml = newRow.innerHTML;
          
          rowHtml = rowHtml.replace(/___MODE_OF_PAYMENT___/g, pay.mode_of_payment || '');
          rowHtml = rowHtml.replace(/999,?777\.77/g, formatCurrency(pay.amount || 0));
          
          newRow.innerHTML = rowHtml;
          if (nextSibling) {
            parentContainer.insertBefore(newRow, nextSibling);
          } else {
            parentContainer.appendChild(newRow);
          }
        });
      }

      // Replace linked CSS stylesheets with inline styles
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

      // 2. Perform global string replacements
      let finalHtml = docDom.documentElement.outerHTML;
      finalHtml = finalHtml.replace(/___INV_NAME___/g, name);
      finalHtml = finalHtml.replace(/___COMPANY___/g, company);
      finalHtml = finalHtml.replace(/___CUSTOMER_NAME___/g, customerName);
      finalHtml = finalHtml.replace(/___CUSTOMER___/g, customer);
      
      const dateRegex = /(1999[-/.]09[-/.]09)|(09[-/.]09[-/.]1999)|(Sep(tember)?\s+9,?\s+1999)|(9\s+Sep(tember)?\s+1999)/gi;
      finalHtml = finalHtml.replace(dateRegex, date);

      const timeRegex = /09:09(:09)?(\s*[AP]M)?/gi;
      finalHtml = finalHtml.replace(timeRegex, time);
      
      finalHtml = finalHtml.replace(/999,?333\.33/g, formatCurrency(subtotal));
      finalHtml = finalHtml.replace(/999,?444\.44/g, formatCurrency(discount));
      finalHtml = finalHtml.replace(/999,?555\.55/g, formatCurrency(grandTotal));
      finalHtml = finalHtml.replace(/999,?666\.66/g, formatCurrency(paidAmount));
      
      finalHtml = finalHtml.replace(/___PREV_OUTSTANDING___/g, formatWithCurrencySymbol(previousOutstanding, docCurrency));
      finalHtml = finalHtml.replace(/___TOTAL_DUE___/g, formatWithCurrencySymbol(totalDue, docCurrency));
      finalHtml = finalHtml.replace(/___CURR_DUE___/g, formatWithCurrencySymbol(currentDue, docCurrency));

      const totalQty = items.reduce((sum: number, item: any) => sum + (item.qty || 0), 0);
      finalHtml = finalHtml.replace(/9999\.99/g, String(totalQty));

      const inWords = numberToWords(grandTotal, docCurrency);
      finalHtml = finalHtml.replace(/___IN_WORDS___/g, inWords);

      // 3. Ensure automatic print triggering
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

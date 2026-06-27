/**
 * invoiceService.ts — Create, save, submit POS Invoices
 * Supports both 'POS Invoice' and 'Sales Invoice' based on POS Settings.
 * Online: frappe.client.insert + frappe.client.submit
 * Offline: save to IndexedDB + sync_queue
 */
import call from '../lib/call';
import { saveDraftInvoice, addToSyncQueue, cachePOSProfile, getCachedPOSProfile } from '../db/posDB';
import type { CartItem, Customer, POSSession } from '../stores/posStore';

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

function buildInvoiceDoc(payload: CreateInvoicePayload): Record<string, any> {
  const {
    session,
    customer,
    cartItems,
    payments,
    discount = 0,
    additionalDiscount = 0,
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
    set_warehouse: session.warehouse,
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
    total_taxes_and_charges: payload.totalTaxes || 0,
    paid_amount: payments.reduce((acc, p) => acc + p.amount, 0),
    ...(hasProfileTaxes ? { taxes_and_charges: session.taxes_and_charges } : {}),
    items: cartItems.map((item) => ({
      item_code: item.item_code,
      item_name: item.item_name,
      qty: item.qty,
      rate: item.rate,
      uom: item.uom,
      warehouse: item.warehouse || session.warehouse,
      discount_percentage: item.discount_percentage || 0,
      discount_amount: (item.price_list_rate || item.rate) - item.rate,
      ...(!hasProfileTaxes ? {
        item_tax_template: item.item_tax_template || null,
        item_tax_rate: typeof item.item_tax_rate === 'object' ? JSON.stringify(item.item_tax_rate) : (item.item_tax_rate || '{}')
      } : {}),
      ...(item.batch_no ? { batch_no: item.batch_no } : {}),
      ...(item.serial_no ? { serial_no: item.serial_no } : {}),
      ...(item.conversion_factor ? { conversion_factor: item.conversion_factor } : {}),
      ...(item.price_list_rate ? { price_list_rate: item.price_list_rate } : {}),
    })),
    payments: payments
      .filter((p) => p.amount > 0)
      .map((p) => ({
        mode_of_payment: p.mode_of_payment,
        amount: p.amount,
      })),
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
export function printInvoiceOffline(doc: any, pfData: any, preOpenedWindow?: Window | null) {
  const printWindow = preOpenedWindow || window.open('', '_blank');
  if (!printWindow) return;

  const company = doc.company || '';
  const name = doc.name || doc.invoiceName || '';
  const date = doc.posting_date || new Date().toISOString().split('T')[0];
  const time = doc.posting_time || new Date().toLocaleTimeString('en-US', { hour12: false });
  const customer = doc.customer || '';
  const items = doc.items || [];
  
  const currency = doc.currency || 'BDT';
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-BD', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0
    }).format(val);
  };

  const subtotal = doc.net_total || 0;
  const discount = doc.discount_amount || 0;
  const grandTotal = doc.grand_total || 0;
  const paidAmount = doc.paid_amount || grandTotal;

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
          while (parent && parent.tagName !== 'TR' && parent.tagName !== 'LI' && parent.tagName !== 'DIV' && parent.tagName !== 'BODY') {
            if (parent.classList.contains('print-format-row') || parent.tagName === 'TR' || parent.tagName === 'LI') {
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
        
        // Remove template placeholder row
        itemRow.remove();

        // Multiply rows for each item in the cart
        items.forEach((item: any) => {
          const newRow = rowTemplate.cloneNode(true) as HTMLElement;
          let rowHtml = newRow.innerHTML;
          
          rowHtml = rowHtml.replace(/___ITEM_NAME___/g, item.item_name || '');
          rowHtml = rowHtml.replace(/___ITEM_CODE___/g, item.item_code || '');
          rowHtml = rowHtml.replace(/___ITEM_UOM___/g, item.uom || '');
          rowHtml = rowHtml.replace(/999\.99/g, String(item.qty));
          rowHtml = rowHtml.replace(/999,?111\.11/g, formatCurrency(item.rate));
          rowHtml = rowHtml.replace(/999,?222\.22/g, formatCurrency(item.qty * item.rate));
          
          newRow.innerHTML = rowHtml;
          parentContainer.appendChild(newRow);
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
      finalHtml = finalHtml.replace(/___CUSTOMER___/g, customer);
      
      const dateRegex = /(1999[-/.]09[-/.]09)|(09[-/.]09[-/.]1999)|(Sep(tember)?\s+9,?\s+1999)|(9\s+Sep(tember)?\s+1999)/gi;
      finalHtml = finalHtml.replace(dateRegex, date);

      const timeRegex = /09:09(:09)?(\s*[AP]M)?/gi;
      finalHtml = finalHtml.replace(timeRegex, time);
      
      finalHtml = finalHtml.replace(/999,?333\.33/g, formatCurrency(subtotal));
      finalHtml = finalHtml.replace(/999,?444\.44/g, formatCurrency(discount));
      finalHtml = finalHtml.replace(/999,?555\.55/g, formatCurrency(grandTotal));
      finalHtml = finalHtml.replace(/999,?666\.66/g, formatCurrency(paidAmount));

      // 3. Ensure automatic print triggering
      if (!finalHtml.includes('window.print()')) {
        finalHtml = finalHtml.replace('</body>', '<script>window.onload = function() { window.print(); }</script></body>');
      }

      printWindow.document.open();
      printWindow.document.write(finalHtml);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 250);
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

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
}

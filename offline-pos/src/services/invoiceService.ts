/**
 * invoiceService.ts — Create, save, submit POS Invoices
 * Supports both 'POS Invoice' and 'Sales Invoice' based on POS Settings.
 * Online: frappe.client.insert + frappe.client.submit
 * Offline: save to IndexedDB + sync_queue
 */
import call from '../lib/call';
import { saveDraftInvoice, addToSyncQueue } from '../db/posDB';
import type { CartItem, Customer, POSSession } from '../stores/posStore';

interface CreateInvoicePayload {
  session: POSSession;
  customer: Customer;
  cartItems: CartItem[];
  payments: Array<{ mode_of_payment: string; amount: number }>;
  discount?: number;
  additionalDiscount?: number;
  isOnline: boolean;
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
    ...(hasProfileTaxes ? { taxes_and_charges: session.taxes_and_charges } : {}),
    items: cartItems.map((item) => ({
      item_code: item.item_code,
      item_name: item.item_name,
      qty: item.qty,
      rate: item.rate,
      uom: item.uom,
      warehouse: item.warehouse || session.warehouse,
      discount_percentage: item.discount_percentage || 0,
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

export async function getPOSProfileData(posProfile: string): Promise<any> {
  return call(
    'erpnext.selling.page.point_of_sale.point_of_sale.get_pos_profile_data',
    { pos_profile: posProfile }
  );
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

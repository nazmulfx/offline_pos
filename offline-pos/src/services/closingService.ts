/**
 * closingService.ts — POS Closing Entry creation and submission
 */
import call from '../lib/call';

export interface ClosingPaymentRow {
  mode_of_payment: string;
  opening_amount: number;
  expected_amount: number;
  closing_amount: number;
  difference: number;
}

export interface ClosingSummary {
  invoices: any[];
  payments: ClosingPaymentRow[];
  taxes: any[];
  grand_total: number;
  net_total: number;
  total_quantity: number;
  total_taxes: number;
  invoice_count: number;
  start_date: string;
  end_date: string;
}

function todayDateTime(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// ─── Fetch invoices + payments for this session ────────────────────────────

export async function fetchClosingSummary(
  posProfile: string,
  user: string,
  periodStartDate: string,
  openingPayments: Array<{ mode_of_payment: string; opening_amount: number }>
): Promise<ClosingSummary> {
  const endDate = todayDateTime();

  const data = await call(
    'erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry.get_invoices',
    {
      start: periodStartDate,
      end: endDate,
      pos_profile: posProfile,
      user,
    }
  );

  const invoices: any[] = data?.invoices || [];
  const rawPayments: Array<{ mode_of_payment: string; amount: number }> = data?.payments || [];
  const taxes: any[] = data?.taxes || [];

  // Build expected amounts per payment method
  const expectedMap: Record<string, number> = {};
  rawPayments.forEach((p) => {
    expectedMap[p.mode_of_payment] = (expectedMap[p.mode_of_payment] || 0) + (p.amount || 0);
  });

  // Merge with opening amounts
  const allMethods = new Set([
    ...openingPayments.map((p) => p.mode_of_payment),
    ...Object.keys(expectedMap),
  ]);

  const payments: ClosingPaymentRow[] = Array.from(allMethods).map((method) => {
    const openingAmt = openingPayments.find((p) => p.mode_of_payment === method)?.opening_amount || 0;
    const expectedAmt = expectedMap[method] || 0;
    const closingAmt = openingAmt + expectedAmt; // default closing = opening + expected
    return {
      mode_of_payment: method,
      opening_amount: openingAmt,
      expected_amount: expectedAmt,
      closing_amount: closingAmt,
      difference: closingAmt - (openingAmt + expectedAmt),
    };
  });

  // Calculate totals
  let grand_total = 0, net_total = 0, total_qty = 0, total_taxes = 0;
  invoices.forEach((inv) => {
    grand_total += inv.grand_total || 0;
    net_total += inv.net_total || 0;
    total_qty += inv.total_qty || 0;
    total_taxes += inv.total_taxes_and_charges || 0;
  });

  return {
    invoices,
    payments,
    taxes,
    grand_total,
    net_total,
    total_quantity: total_qty,
    total_taxes,
    invoice_count: invoices.length,
    start_date: periodStartDate,
    end_date: endDate,
  };
}

// ─── Build and submit POS Closing Entry ────────────────────────────────────

export async function submitClosingEntry(
  session: {
    pos_opening: string;
    pos_profile: string;
    company: string;
    period_start_date: string;
    invoice_type: 'POS Invoice' | 'Sales Invoice';
  },
  summary: ClosingSummary,
  closingPayments: ClosingPaymentRow[]
): Promise<{ success: boolean; name?: string; error?: string }> {
  const now = new Date();
  const postingDate = now.toISOString().split('T')[0];
  const postingTime = now.toTimeString().split(' ')[0];
  const user = getLoggedInUser();

  // Separate invoices by type
  const posInvoices = summary.invoices
    .filter((inv) => inv.doctype === 'POS Invoice')
    .map((inv) => ({
      pos_invoice: inv.name,
      posting_date: inv.posting_date,
      grand_total: inv.grand_total,
      customer: inv.customer,
      is_return: inv.is_return,
      return_against: inv.return_against,
    }));

  const salesInvoices = summary.invoices
    .filter((inv) => inv.doctype === 'Sales Invoice')
    .map((inv) => ({
      sales_invoice: inv.name,
      posting_date: inv.posting_date,
      grand_total: inv.grand_total,
      customer: inv.customer,
      is_return: inv.is_return,
      return_against: inv.return_against,
    }));

  const doc: Record<string, any> = {
    doctype: 'POS Closing Entry',
    pos_opening_entry: session.pos_opening,
    period_start_date: session.period_start_date,
    period_end_date: summary.end_date,
    pos_profile: session.pos_profile,
    company: session.company,
    user,
    posting_date: postingDate,
    posting_time: postingTime,
    grand_total: summary.grand_total,
    net_total: summary.net_total,
    total_quantity: summary.total_quantity,
    total_taxes_and_charges: summary.total_taxes,
    pos_invoices: posInvoices,
    sales_invoices: salesInvoices,
    payment_reconciliation: closingPayments.map((p) => ({
      mode_of_payment: p.mode_of_payment,
      opening_amount: p.opening_amount,
      expected_amount: p.expected_amount,
      closing_amount: p.closing_amount,
      difference: p.closing_amount - (p.opening_amount + p.expected_amount),
    })),
    taxes: summary.taxes.map((t) => ({
      account_head: t.account_head,
      amount: t.tax_amount,
    })),
  };

  try {
    const insertedDoc = await call('frappe.client.insert', { doc });
    await call('frappe.client.submit', { doc: insertedDoc });
    return { success: true, name: insertedDoc.name };
  } catch (err: any) {
    const messages: string[] = err?.messages || [];
    return {
      success: false,
      error: messages.length > 0 ? messages.join('\n') : err?.message || 'Failed to submit closing entry',
    };
  }
}

function getLoggedInUser(): string {
  const cookies = Object.fromEntries(
    document.cookie.split('; ').filter(Boolean).map((part) => {
      const [k, ...v] = part.split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
  return cookies.user_id || 'Administrator';
}

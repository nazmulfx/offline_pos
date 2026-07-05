import frappe
from erpnext.accounts.report.customer_ledger_summary.customer_ledger_summary import PartyLedgerSummaryReport

# @frappe.whitelist()
def get_customer_outstanding(customer, company=None):
    if not company:
        company = frappe.defaults.get_user_default("Company")

    filters = {
        'company': company,
        'from_date': frappe.utils.now(),
        'to_date': frappe.utils.now(),
        'party': customer
    }
    args = {
        "party_type": "Customer",
        "naming_by": ["Selling Settings", "cust_master_name"],
    }
    data = PartyLedgerSummaryReport(filters).run(args)
    if len(data[1]) > 0:
        return data[1][0].get("closing_balance")
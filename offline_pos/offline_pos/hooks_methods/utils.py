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

from frappe.utils import flt

def on_gl_entry(doc, method=None):
    if doc.party_type in ["Customer", "Supplier"] and doc.party:
        update_party_balance(doc.company, doc.party_type, doc.party)

def update_party_balance(company, party_type, party):
    if not company or not party_type or not party:
        return
        
    # Get balance based on party type
    if party_type == "Customer":
        balance = frappe.db.sql("""
            select sum(debit_in_account_currency) - sum(credit_in_account_currency)
            from `tabGL Entry`
            where party_type = %s and party = %s and company = %s and is_cancelled = 0
        """, (party_type, party, company))
    elif party_type == "Supplier":
        balance = frappe.db.sql("""
            select sum(credit_in_account_currency) - sum(debit_in_account_currency)
            from `tabGL Entry`
            where party_type = %s and party = %s and company = %s and is_cancelled = 0
        """, (party_type, party, company))
    else:
        return
        
    val = flt(balance[0][0]) if balance and balance[0][0] is not None else 0.0
    
    # Get company abbreviation
    abbr = frappe.db.get_value("Company", company, "abbr")
    if not abbr:
        return
        
    doc_name = f"{abbr}-{party_type}-{party}"
    
    if frappe.db.exists("Party Balance", doc_name):
        frappe.db.set_value("Party Balance", doc_name, "party_current_balance", val, update_modified=False)
    else:
        # Create a new Party Balance document
        doc = frappe.get_doc({
            "doctype": "Party Balance",
            "company": company,
            "party_type": party_type,
            "party": party,
            "abbr": abbr,
            "party_current_balance": val
        })
        doc.insert(ignore_permissions=True)
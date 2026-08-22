import frappe
from frappe.utils import cint, flt, today, nowtime

@frappe.whitelist()
def zero_out_stock(company, warehouse=None, expense_account=None, cost_center=None, submit_doc=1):
	"""
	Whitelisted API method to perform Stock Reconciliation that zeroes out stock
	for all items in the specified warehouse(s) / company.
	
	Whitelisted Call Path:
	site_url/api/method/offline_pos.stock_reconciliation.zero_out_stock
	
	Handles:
	- Non-batch / non-serial items
	- Batch items
	- Serial No items
	- Batch + Serial No items
	- Filters out disabled items to prevent validation errors
	"""
	# 1. Check permissions (Requires Stock Reconciliation create permission or System Manager role)
	if not (frappe.has_permission("Stock Reconciliation", "create") or "System Manager" in frappe.get_roles()):
		frappe.throw(frappe._("Not authorized to run Stock Reconciliation"), frappe.PermissionError)

	# 2. Resolve Company, Expense Account, and Cost Center
	company_doc = frappe.get_doc("Company", company)
	if not expense_account:
		expense_account = company_doc.stock_adjustment_account
		if not expense_account:
			frappe.throw(frappe._("Please specify Expense Account or set default Stock Adjustment Account in Company {0}").format(company))

	if not cost_center:
		cost_center = company_doc.cost_center

	# 3. Find target warehouses (non-group warehouses)
	if warehouse:
		warehouses = [warehouse]
	else:
		warehouses = [
			w.name for w in frappe.get_all("Warehouse", filters={"company": company, "is_group": 0}, fields=["name"])
		]

	if not warehouses:
		frappe.throw(frappe._("No valid non-group warehouses found for company {0}").format(company))

	# 4. Collect all items with non-zero stock
	items_to_reconcile = []

	for wh in warehouses:
		from erpnext.stock.doctype.stock_reconciliation.stock_reconciliation import get_items
		
		wh_items = get_items(
			warehouse=wh,
			posting_date=today(),
			posting_time=nowtime(),
			company=company,
			ignore_empty_stock=True
		)

		for d in wh_items:
			item_code = d.get("item_code")
			if not item_code:
				continue

			# Exclude disabled items (disabled items cannot be reconciled in ERPNext)
			is_disabled = frappe.db.get_value("Item", item_code, "disabled")
			if is_disabled:
				continue

			qty = flt(d.get("qty"))
			# Only include rows that currently have stock (positive or negative)
			if qty != 0:
				has_batch = bool(d.get("batch_no"))
				has_serial = bool(d.get("serial_no"))

				reco_row = {
					"item_code": item_code,
					"warehouse": d.get("warehouse") or wh,
					"qty": 0,  # Target stock set to 0
					"valuation_rate": d.get("valuation_rate", 0),
					"allow_zero_valuation_rate": 1,
				}

				if has_batch or has_serial:
					reco_row["use_serial_batch_fields"] = 1
					if has_batch:
						reco_row["batch_no"] = d.get("batch_no")
					if has_serial:
						reco_row["serial_no"] = d.get("serial_no")

				items_to_reconcile.append(reco_row)

	if not items_to_reconcile:
		return {
			"status": "success",
			"message": "No active items found with non-zero stock balance.",
			"reconciliations": []
		}

	# 5. Split items into chunks of 500 to avoid payload / DB limits
	chunk_size = 500
	created_docs = []

	for i in range(0, len(items_to_reconcile), chunk_size):
		chunk = items_to_reconcile[i : i + chunk_size]
		
		reco = frappe.get_doc({
			"doctype": "Stock Reconciliation",
			"purpose": "Stock Reconciliation",
			"company": company,
			"posting_date": today(),
			"posting_time": nowtime(),
			"expense_account": expense_account,
			"cost_center": cost_center,
			"items": chunk
		})
		
		reco.insert(ignore_permissions=True)
		frappe.db.commit()
		
		if cint(submit_doc):
			reco.submit()
			frappe.db.commit()
			
		created_docs.append({
			"name": reco.name,
			"docstatus": reco.docstatus,
			"items_count": len(chunk)
		})

	return {
		"status": "success",
		"message": f"Successfully created {len(created_docs)} Stock Reconciliation document(s) zeroing out {len(items_to_reconcile)} item row(s).",
		"reconciliations": created_docs
	}

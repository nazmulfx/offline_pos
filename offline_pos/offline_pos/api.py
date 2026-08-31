import frappe
from frappe.utils import flt

@frappe.whitelist()
def update_item_valuation_rates(item_code=None, price_list=None):
	"""
	API Endpoint Path:
	------------------
	Python Method: offline_pos.offline_pos.api.update_item_valuation_rates
	REST API URL : /api/method/offline_pos.offline_pos.api.update_item_valuation_rates

	Description:
	------------
	Updates ONLY the valuation_rate field in the Item DocType.
	It fetches the buying rate (last_purchase_rate or Buying Item Price) for items where
	valuation_rate is missing or 0, sets item.valuation_rate = buying_rate, and saves the item.
	
	Params:
		item_code (str, optional): Specific item code to update. If omitted, checks all items.
		price_list (str, optional): Buying price list to check if last_purchase_rate is not set.
	
	Returns:
		dict: Summary of updated items and status.
	"""
	filters = {}
	if item_code:
		filters["name"] = item_code

	# 1. Fetch items
	items = frappe.get_all(
		"Item",
		filters=filters,
		fields=["name", "item_code", "item_name", "last_purchase_rate", "valuation_rate"]
	)

	# 2. Fetch buying price list rates in bulk as fallback
	price_list = price_list or "Standard Buying"
	item_prices = frappe.get_all(
		"Item Price",
		filters={"buying": 1, "price_list": price_list},
		fields=["item_code", "price_list_rate"]
	)
	price_map = {d.item_code: flt(d.price_list_rate) for d in item_prices}

	updated_count = 0
	updated_items = []

	# 3. Process each item
	for item_data in items:
		code = item_data.name
		last_purchase_rate = flt(item_data.last_purchase_rate)
		buying_price_list_rate = price_map.get(code, 0.0)

		# Skip if item already has a valuation rate set (> 0)
		if flt(item_data.valuation_rate) > 0:
			continue

		# Determine buying rate: primary is last_purchase_rate, fallback is Item Price buying rate
		buying_rate = last_purchase_rate or buying_price_list_rate

		if buying_rate > 0:
			item_doc = frappe.get_doc("Item", code)
			old_rate = flt(item_doc.valuation_rate)
			
			# Set valuation rate and save item
			item_doc.valuation_rate = buying_rate
			item_doc.save(ignore_permissions=True)

			updated_count += 1
			updated_items.append({
				"item_code": code,
				"item_name": item_data.item_name,
				"old_valuation_rate": old_rate,
				"new_valuation_rate": buying_rate,
				"rate_source": "last_purchase_rate" if last_purchase_rate else f"buying_price_list ({price_list})"
			})

	frappe.db.commit()

	return {
		"status": "success",
		"message": f"Successfully updated valuation rate for {updated_count} item(s).",
		"updated_count": updated_count,
		"updated_items": updated_items
	}


@frappe.whitelist()
def reconcile_stock_valuation_rates(company=None, warehouse=None, batch_size=500, submit=False):
	"""
	API Endpoint Path:
	------------------
	Python Method: offline_pos.offline_pos.api.reconcile_stock_valuation_rates
	REST API URL : /api/method/offline_pos.offline_pos.api.reconcile_stock_valuation_rates

	Description:
	------------
	Creates Stock Reconciliation document(s) to update stock ledger entries for items 
	where current actual_qty > 0, applying Item.valuation_rate as the new valuation_rate.

	Params:
		company (str, optional): Target company name. Defaults to default company.
		warehouse (str, optional): Specific warehouse to reconcile. If omitted, checks all warehouses.
		batch_size (int, optional): Max items per Stock Reconciliation document. Default 500.
		submit (bool/int, optional): If True (1), automatically submits created Stock Reconciliation docs.

	Returns:
		dict: Created document names and status.
	"""
	if not company:
		company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")

	warehouse_condition = ""
	params = {"company": company}
	if warehouse:
		warehouse_condition = "AND b.warehouse = %(warehouse)s"
		params["warehouse"] = warehouse

	# Fetch active stock items where current stock ledger rate differs from Item.valuation_rate
	bins = frappe.db.sql(f"""
		SELECT 
			b.item_code,
			b.warehouse,
			b.actual_qty,
			i.valuation_rate
		FROM `tabBin` b
		JOIN `tabItem` i ON b.item_code = i.name
		JOIN `tabWarehouse` w ON b.warehouse = w.name
		WHERE w.company = %(company)s 
		  AND b.actual_qty > 0 
		  AND i.valuation_rate > 0
		  AND ABS(COALESCE(b.valuation_rate, 0) - i.valuation_rate) > 0.001
		  {warehouse_condition}
		ORDER BY b.warehouse, b.item_code
	""", params, as_dict=True)

	if not bins:
		return {
			"status": "info",
			"message": "All active stock items already have matching valuation rates in the Stock Ledger. No reconciliation is needed.",
			"reconciliation_docs": []
		}

	batch_size = int(batch_size) if batch_size else 500
	created_docs = []

	for i in range(0, len(bins), batch_size):
		chunk = bins[i:i + batch_size]
		
		doc = frappe.get_doc({
			"doctype": "Stock Reconciliation",
			"company": company,
			"purpose": "Stock Reconciliation",
			"posting_date": frappe.utils.nowdate(),
			"posting_time": frappe.utils.nowtime(),
			"items": []
		})

		for row in chunk:
			doc.append("items", {
				"item_code": row.item_code,
				"warehouse": row.warehouse,
				"qty": flt(row.actual_qty),
				"valuation_rate": flt(row.valuation_rate)
			})

		doc.insert(ignore_permissions=True)
		
		if submit and (submit == True or submit == "1" or submit == "true"):
			doc.submit()

		created_docs.append(doc.name)

	frappe.db.commit()

	return {
		"status": "success",
		"message": f"Successfully created {len(created_docs)} Stock Reconciliation document(s) for {len(bins)} item-warehouse pair(s).",
		"reconciliation_docs": created_docs,
		"submitted": bool(submit)
	}


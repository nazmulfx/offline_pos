import frappe
from erpnext.selling.page.point_of_sale.point_of_sale import get_items as original_get_items
from erpnext.stock.get_item_details import _get_item_tax_template, get_item_tax_map

@frappe.whitelist()
def get_items(start, page_length, price_list, item_group, pos_profile, search_term=""):
	res = original_get_items(start, page_length, price_list, item_group, pos_profile, search_term)
	if not res or not res.get("items"):
		return res

	company = frappe.db.get_value("POS Profile", pos_profile, "company")
	ctx = frappe._dict({
		"company": company,
		"posting_date": frappe.utils.today(),
	})

	for item in res["items"]:
		item_code = item.get("item_code")
		if not item_code:
			continue
		item_doc = frappe.get_cached_doc("Item", item_code)
		
		# Find tax template
		item_tax_template = None
		if item_doc.taxes:
			item_tax_template = _get_item_tax_template(ctx, item_doc.taxes)

		if not item_tax_template:
			curr_item_group = item_doc.item_group
			while curr_item_group and not item_tax_template:
				item_group_doc = frappe.get_cached_doc("Item Group", curr_item_group)
				item_tax_template = _get_item_tax_template(ctx, item_group_doc.taxes)
				curr_item_group = item_group_doc.parent_item_group

		item_tax_rate = "{}"
		if item_tax_template:
			item_tax_rate = get_item_tax_map(doc=ctx, tax_template=item_tax_template, as_json=True)

		item["item_tax_template"] = item_tax_template
		item["item_tax_rate"] = item_tax_rate
		item["has_batch_no"] = item_doc.has_batch_no
		item["has_serial_no"] = item_doc.has_serial_no

	return res


@frappe.whitelist()
def get_print_format_template(print_format, doctype="POS Invoice"):
	try:
		doc = frappe.new_doc(doctype)
		doc.name = "___INV_NAME___"
		doc.company = "___COMPANY___"
		doc.customer = "___CUSTOMER___"
		doc.posting_date = "1999-09-09"
		doc.posting_time = "09:09:09"
		doc.net_total = 999333.33
		doc.grand_total = 999555.55
		doc.paid_amount = 999666.66
		doc.discount_amount = 999444.44
		doc.currency = "BDT"
		
		doc.append("items", {
			"item_code": "___ITEM_CODE___",
			"item_name": "___ITEM_NAME___",
			"qty": 999.99,
			"rate": 999111.11,
			"amount": 999222.22,
			"uom": "___ITEM_UOM___"
		})
		
		html = frappe.get_print(doctype, doc.name, print_format, doc=doc)
		return {
			"name": print_format,
			"html": html or "",
		}
	except Exception as e:
		try:
			pf = frappe.get_doc("Print Format", print_format)
			return {
				"name": pf.name,
				"html": pf.html or "",
				"css": pf.css or "",
			}
		except Exception:
			return None

@frappe.whitelist()
def get_serial_batch_data(warehouse):
	based_on = frappe.get_single_value("Stock Settings", "pick_serial_and_batch_based_on") or "FIFO"
	
	# Fetch all items with serial/batch
	items = frappe.get_all("Item", filters={"disabled": 0}, or_filters=[{"has_serial_no": 1}, {"has_batch_no": 1}], fields=["name", "has_serial_no", "has_batch_no"])
	item_map = {item.name: item for item in items}
	
	# Query all Active Serial Nos in this warehouse
	serial_filters = {"warehouse": warehouse, "status": "Active"}
	serial_fields = ["name", "item_code", "batch_no", "creation"]
	
	order_by = "creation asc"
	if based_on == "LIFO":
		order_by = "creation desc"
	elif based_on == "Expiry":
		order_by = "amc_expiry_date asc, creation asc"
		
	serial_nos = frappe.get_all("Serial No", filters=serial_filters, fields=serial_fields, order_by=order_by, limit=50000)
	
	from erpnext.stock.doctype.serial_and_batch_bundle.serial_and_batch_bundle import get_auto_batch_nos
	
	batches_data = {}
	for item_code, item in item_map.items():
		if item.has_batch_no:
			try:
				kwargs = frappe._dict({
					"item_code": item_code,
					"warehouse": warehouse,
					"based_on": based_on,
					"qty": 0
				})
				res = get_auto_batch_nos(kwargs)
				enriched = []
				for b in res:
					exp = frappe.db.get_value("Batch", b.batch_no, "expiry_date")
					enriched.append({
						"batch_no": b.batch_no,
						"qty": b.qty,
						"expiry_date": str(exp) if exp else None
					})
				if based_on == "Expiry":
					enriched.sort(key=lambda x: x["expiry_date"] or "9999-12-31")
				batches_data[item_code] = enriched
			except Exception:
				pass

	# Group serials by item_code
	serials_data = {}
	for sn in serial_nos:
		ic = sn.item_code
		if ic not in serials_data:
			serials_data[ic] = []
		serials_data[ic].append({
			"serial_no": sn.name,
			"batch_no": sn.batch_no
		})
		
	result = {}
	for item_code, item in item_map.items():
		result[item_code] = {
			"has_serial_no": item.has_serial_no,
			"has_batch_no": item.has_batch_no,
			"serials": serials_data.get(item_code, []),
			"batches": batches_data.get(item_code, [])
		}
		
	return {
		"pick_serial_and_batch_based_on": based_on,
		"data": result
	}



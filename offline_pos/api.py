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


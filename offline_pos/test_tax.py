import frappe
from erpnext.stock.get_item_details import _get_item_tax_template, get_item_tax_map

def test():
    item_doc = frappe.get_cached_doc("Item", "SKU001")
    company = "Nazmul Inc. (Demo)"
    ctx = frappe._dict({
        "company": company,
        "posting_date": frappe.utils.today(),
    })

    item_tax_template = None
    if item_doc.taxes:
        item_tax_template = _get_item_tax_template(ctx, item_doc.taxes)

    if not item_tax_template:
        item_group = item_doc.item_group
        while item_group and not item_tax_template:
            item_group_doc = frappe.get_cached_doc("Item Group", item_group)
            item_tax_template = _get_item_tax_template(ctx, item_group_doc.taxes)
            item_group = item_group_doc.parent_item_group

    item_tax_rate = "{}"
    if item_tax_template:
        item_tax_rate = get_item_tax_map(doc=ctx, tax_template=item_tax_template, as_json=True)

    print("item_tax_template:", item_tax_template)
    print("item_tax_rate:", item_tax_rate)

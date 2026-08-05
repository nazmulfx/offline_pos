# Copyright (c) 2026, Nazmul Hossain and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters: dict | None = None) -> tuple[list[dict], list[dict]]:
	if not filters:
		filters = {}

	# 1. Build filters and query Sales Invoice using ORM
	inv_filters = {"docstatus": 1}

	if filters.get("company"):
		inv_filters["company"] = filters["company"]

	if filters.get("from_date") and filters.get("to_date"):
		inv_filters["posting_date"] = ["between", [filters["from_date"], filters["to_date"]]]
	else:
		frappe.msgprint(_("Please select both From Date and To Date"))
		return [], []

	invoices = frappe.get_all(
		"Sales Invoice",
		filters=inv_filters,
		fields=["name", "customer", "grand_total", "status", "outstanding_amount"],
		order_by="posting_date desc, creation desc",
	)

	# 2. Query Sales Invoice Payment child table for fetched invoices
	payments_map = {}
	payment_modes = set()

	if invoices:
		invoice_names = [inv["name"] for inv in invoices]
		payments = frappe.get_all(
			"Sales Invoice Payment",
			filters={"parent": ["in", invoice_names]},
			fields=["parent", "mode_of_payment", "amount"],
		)

		for p in payments:
			mop = p.get("mode_of_payment")
			if not mop:
				continue
			payment_modes.add(mop)
			parent = p.get("parent")
			if parent not in payments_map:
				payments_map[parent] = {}
			payments_map[parent][mop] = payments_map[parent].get(mop, 0.0) + (p.get("amount") or 0.0)

	# Fallback to all Mode of Payment if no payment modes found in dataset
	if not payment_modes:
		payment_modes = set(frappe.get_all("Mode of Payment", pluck="name"))

	sorted_payment_modes = sorted(list(payment_modes))

	# 3. Define columns
	columns = [
		{"label": _("Invoice ID"), "fieldname": "name", "fieldtype": "Link", "options": "Sales Invoice", "width": 140},
		{"label": _("Customer"), "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 150},
		{"label": _("Grand Total"), "fieldname": "grand_total", "fieldtype": "Currency", "width": 120},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 100},
		{"label": _("Curr. Outstanding"), "fieldname": "outstanding_amount", "fieldtype": "Currency", "width": 120},
	]

	mode_field_map = {}
	for mode in sorted_payment_modes:
		fn = frappe.scrub(mode)
		mode_field_map[mode] = fn
		columns.append(
			{
				"label": _(mode),
				"fieldname": fn,
				"fieldtype": "Currency",
				"width": 120,
			}
		)

	# 4. Build data rows
	data = []
	for inv in invoices:
		row = {
			"name": inv["name"],
			"customer": inv["customer"],
			"grand_total": inv["grand_total"],
			"status": inv["status"],
			"outstanding_amount": inv["outstanding_amount"],
		}
		inv_payments = payments_map.get(inv["name"], {})
		for mode in sorted_payment_modes:
			fn = mode_field_map[mode]
			row[fn] = inv_payments.get(mode, 0.0)
		data.append(row)

	return columns, data

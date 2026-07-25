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
		pf = frappe.get_doc("Print Format", print_format)
		return {
			"name": pf.name,
			"html": pf.html or "",
			"css": pf.css or "",
		}
	except Exception as e:
		return None

@frappe.whitelist()
def get_serial_batch_data(warehouse, item_code=None):
	based_on = frappe.get_single_value("Stock Settings", "pick_serial_and_batch_based_on") or "FIFO"
	
	# Fetch all items with serial/batch
	if item_code:
		items = frappe.get_all("Item", filters={"name": item_code, "disabled": 0}, fields=["name", "has_serial_no", "has_batch_no"])
	else:
		items = frappe.get_all("Item", filters={"disabled": 0}, or_filters=[{"has_serial_no": 1}, {"has_batch_no": 1}], fields=["name", "has_serial_no", "has_batch_no"])
	item_map = {item.name: item for item in items}
	
	# Query all Active Serial Nos in this warehouse
	serial_filters = {"warehouse": warehouse, "status": "Active"}
	if item_code:
		serial_filters["item_code"] = item_code
	serial_fields = ["name", "item_code", "batch_no", "creation", "status"]
	
	order_by = "creation asc"
	if based_on == "LIFO":
		order_by = "creation desc"
	elif based_on == "Expiry":
		order_by = "amc_expiry_date asc, creation asc"
		
	serial_nos = frappe.get_all("Serial No", filters=serial_filters, fields=serial_fields, order_by=order_by, limit=50000)
	
	from erpnext.stock.doctype.serial_and_batch_bundle.serial_and_batch_bundle import get_auto_batch_nos
	
	batches_data = {}
	for item_code_key, item in item_map.items():
		if item.has_batch_no:
			try:
				kwargs = frappe._dict({
					"item_code": item_code_key,
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
				batches_data[item_code_key] = enriched
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
			"batch_no": sn.batch_no,
			"status": sn.status or "Active"
		})
		
	result = {}
	for item_code_key, item in item_map.items():
		result[item_code_key] = {
			"has_serial_no": item.has_serial_no,
			"has_batch_no": item.has_batch_no,
			"serials": serials_data.get(item_code_key, []),
			"batches": batches_data.get(item_code_key, [])
		}
		
	return {
		"pick_serial_and_batch_based_on": based_on,
		"data": result
	}


@frappe.whitelist()
def get_pos_session_summary(pos_profile=None, user=None, from_date=None, to_date=None, status=None, company=None):
	# Fetch cash modes
	cash_modes = [d.name for d in frappe.db.get_all("Mode of Payment", filters={"type": "Cash"})]
	if not cash_modes:
		cash_modes = ["Cash"]

	# Build filters for POS Opening Entry
	filters = {}
	if company:
		filters['company'] = company
	if pos_profile:
		filters['pos_profile'] = pos_profile
	if user:
		filters['user'] = user
	
	if status and status != "All":
		filters['status'] = status
	else:
		filters['status'] = ['!=', 'Cancelled']

	if from_date and to_date:
		filters['period_start_date'] = ['between', [from_date + ' 00:00:00', to_date + ' 23:59:59']]
	elif from_date:
		filters['period_start_date'] = ['>=', from_date + ' 00:00:00']
	elif to_date:
		filters['period_start_date'] = ['<=', to_date + ' 23:59:59']

	opening_entries = frappe.get_all("POS Opening Entry",
		filters=filters,
		fields=["name", "period_start_date", "period_end_date", "status", "pos_profile", "user", "company", "pos_closing_entry"],
		order_by="period_start_date desc"
	)

	session_ids = [d.name for d in opening_entries]
	if not session_ids:
		return []

	# Find all closed POS Closing Entry details if any
	closing_names = [d.pos_closing_entry for d in opening_entries if d.pos_closing_entry]
	closing_entry_details = {}
	closing_dates = {}
	if closing_names:
		closings = frappe.get_all("POS Closing Entry",
			filters={"name": ["in", closing_names]},
			fields=["name", "period_end_date"]
		)
		closing_dates = {c.name: c.period_end_date for c in closings}

		closing_details = frappe.get_all("POS Closing Entry Detail",
			filters={"parent": ["in", closing_names]},
			fields=["parent", "mode_of_payment", "opening_amount", "expected_amount", "closing_amount", "difference"]
		)
		for cd in closing_details:
			closing_entry_details.setdefault(cd.parent, []).append(cd)

	# Query closed invoices
	closed_invoices = []
	if closing_names:
		closed_invoices = frappe.get_all("Sales Invoice",
			filters={"pos_closing_entry": ["in", closing_names], "docstatus": 1, "is_pos": 1},
			fields=["name", "grand_total", "outstanding_amount", "is_return", "pos_closing_entry"]
		)

	# Query open invoices
	open_invoices = []
	open_entries = [d for d in opening_entries if not d.pos_closing_entry]
	if open_entries:
		min_start_date = min(d.period_start_date for d in open_entries)
		potential_open_invoices = frappe.get_all("Sales Invoice",
			filters={
				"posting_date": [">=", min_start_date.date() if hasattr(min_start_date, 'date') else min_start_date],
				"docstatus": 1,
				"is_pos": 1,
				"is_created_using_pos": 1,
				"pos_closing_entry": ["in", ["", None]]
			},
			fields=["name", "grand_total", "outstanding_amount", "is_return", "pos_profile", "owner", "posting_date", "posting_time"]
		)
		
		from frappe.utils import get_datetime
		for inv in potential_open_invoices:
			inv_datetime = get_datetime(f"{inv.posting_date} {str(inv.posting_time)}")
			for entry in open_entries:
				if entry.pos_profile == inv.pos_profile and entry.user == inv.owner:
					entry_start = get_datetime(entry.period_start_date)
					if entry_start <= inv_datetime:
						# Dynamically set a temp attribute to map
						inv.pos_opening_entry = entry.name
						open_invoices.append(inv)
						break

	# Now combine and group invoices by session ID
	invoices_by_session = {}
	
	closing_to_opening = {d.pos_closing_entry: d.name for d in opening_entries if d.pos_closing_entry}
	for inv in closed_invoices:
		opening_id = closing_to_opening.get(inv.pos_closing_entry)
		if opening_id:
			invoices_by_session.setdefault(opening_id, []).append(inv)
			
	for inv in open_invoices:
		invoices_by_session.setdefault(inv.pos_opening_entry, []).append(inv)

	# Combine all invoice names for payment query
	all_invoices = closed_invoices + open_invoices
	invoice_names = [inv.name for inv in all_invoices]

	# Query all payments for these invoices
	payments_by_invoice = {}
	if invoice_names:
		payments = frappe.get_all("Sales Invoice Payment",
			filters={"parent": ["in", invoice_names], "parenttype": "Sales Invoice"},
			fields=["parent", "mode_of_payment", "amount"]
		)
		for p in payments:
			payments_by_invoice.setdefault(p.parent, []).append(p)

	# Fetch opening details for these sessions
	opening_details = frappe.get_all("POS Opening Entry Detail",
		filters={"parent": ["in", session_ids]},
		fields=["parent", "mode_of_payment", "opening_amount"]
	)
	opening_details_by_session = {}
	for od in opening_details:
		opening_details_by_session.setdefault(od.parent, []).append(od)

	# Fetch company currencies
	company_currencies = {}
	for entry in opening_entries:
		if entry.company and entry.company not in company_currencies:
			currency = frappe.db.get_value("Company", entry.company, "default_currency")
			company_currencies[entry.company] = currency or frappe.db.get_default("currency") or "USD"

	results = []
	for entry in opening_entries:
		session_id = entry.name
		status = entry.status

		# Opening / Closing Time
		opening_time = entry.period_start_date
		closing_time = None
		if entry.pos_closing_entry:
			closing_time = closing_dates.get(entry.pos_closing_entry)

		session_invoices = invoices_by_session.get(session_id, [])

		cash_sales = 0
		bank_card_sales = 0
		credit_sales = 0
		total_sales = 0
		returns = 0
		net_sales = 0
		expected_cash = 0
		actual_cash = None
		difference = None

		normal_invoices = [inv for inv in session_invoices if not inv.is_return]
		return_invoices = [inv for inv in session_invoices if inv.is_return]

		# Calculate Total Sales (Gross Sales from normal invoices)
		total_sales = sum(inv.grand_total for inv in normal_invoices)

		# Calculate Returns (Gross returns as positive number)
		returns = sum(abs(inv.grand_total) for inv in return_invoices)

		# Net Sales
		net_sales = total_sales - returns

		# Cash, Bank/Card, and Credit sales from normal invoices
		for inv in normal_invoices:
			credit_sales += inv.outstanding_amount
			inv_payments = payments_by_invoice.get(inv.name, [])
			for p in inv_payments:
				if p.mode_of_payment in cash_modes:
					cash_sales += p.amount
				else:
					bank_card_sales += p.amount

		# Cash refunds from return invoices
		cash_refunds = 0
		for inv in return_invoices:
			inv_payments = payments_by_invoice.get(inv.name, [])
			for p in inv_payments:
				if p.mode_of_payment in cash_modes:
					cash_refunds += abs(p.amount)

		# Opening Cash
		opening_cash = 0
		session_opening_details = opening_details_by_session.get(session_id, [])
		for od in session_opening_details:
			if od.mode_of_payment in cash_modes:
				opening_cash += od.opening_amount

		# Expected, Actual and Difference Cash
		if entry.pos_closing_entry:
			session_closing_details = closing_entry_details.get(entry.pos_closing_entry, [])
			cash_closing_detail = None
			for cd in session_closing_details:
				if cd.mode_of_payment in cash_modes:
					cash_closing_detail = cd
					break

			if cash_closing_detail:
				expected_cash = cash_closing_detail.expected_amount
				actual_cash = cash_closing_detail.closing_amount
				difference = cash_closing_detail.difference
			else:
				expected_cash = opening_cash + cash_sales - cash_refunds
				actual_cash = 0
				difference = actual_cash - expected_cash
		else:
			expected_cash = opening_cash + cash_sales - cash_refunds
			actual_cash = None
			difference = None

		results.append({
			"session_id": session_id,
			"opening_time": opening_time,
			"closing_time": closing_time,
			"status": status,
			"pos_profile": entry.pos_profile,
			"user": entry.user,
			"company": entry.company,
			"currency": company_currencies.get(entry.company, "USD"),
			"cash_sales": cash_sales,
			"bank_card_sales": bank_card_sales,
			"credit_sales": credit_sales,
			"total_sales": total_sales,
			"returns": returns,
			"net_sales": net_sales,
			"expected_cash": expected_cash,
			"actual_cash": actual_cash,
			"difference": difference
		})

	return results


@frappe.whitelist()
def get_pos_session_details(session_id):
	# Fetch cash modes
	cash_modes = [d.name for d in frappe.db.get_all("Mode of Payment", filters={"type": "Cash"})]
	if not cash_modes:
		cash_modes = ["Cash"]

	opening_entry = frappe.get_doc("POS Opening Entry", session_id)
	
	invoices = []
	if opening_entry.pos_closing_entry:
		# Closed session: query by pos_closing_entry
		invoices = frappe.get_all("Sales Invoice",
			filters={"pos_closing_entry": opening_entry.pos_closing_entry, "docstatus": 1, "is_pos": 1},
			fields=["name", "customer", "posting_date", "posting_time", "grand_total", "outstanding_amount", "is_return"]
		)
	else:
		# Open session: query by profile, user, datetime
		from frappe.utils import get_datetime
		potential_invoices = frappe.get_all("Sales Invoice",
			filters={
				"posting_date": [">=", opening_entry.period_start_date.date() if hasattr(opening_entry.period_start_date, 'date') else opening_entry.period_start_date],
				"docstatus": 1,
				"is_pos": 1,
				"is_created_using_pos": 1,
				"pos_closing_entry": ["in", ["", None]]
			},
			fields=["name", "customer", "posting_date", "posting_time", "grand_total", "outstanding_amount", "is_return", "pos_profile", "owner"]
		)
		
		entry_start = get_datetime(opening_entry.period_start_date)
		for inv in potential_invoices:
			inv_datetime = get_datetime(f"{inv.posting_date} {str(inv.posting_time)}")
			if opening_entry.pos_profile == inv.pos_profile and opening_entry.user == inv.owner:
				if entry_start <= inv_datetime:
					invoices.append(inv)

	invoice_names = [inv.name for inv in invoices]
	
	payments = []
	if invoice_names:
		payments = frappe.get_all("Sales Invoice Payment",
			filters={"parent": ["in", invoice_names], "parenttype": "Sales Invoice"},
			fields=["parent", "mode_of_payment", "amount"]
		)

	# Aggregate payments by mode of payment
	payments_by_mode = {}
	for p in payments:
		payments_by_mode[p.mode_of_payment] = payments_by_mode.get(p.mode_of_payment, 0) + p.amount

	# Format payments as list
	payment_summary = []
	for mode, amt in payments_by_mode.items():
		payment_summary.append({
			"mode_of_payment": mode,
			"amount": amt,
			"is_cash": mode in cash_modes
		})

	# Opening Details
	opening_balances = []
	opening_details = frappe.get_all("POS Opening Entry Detail",
		filters={"parent": session_id},
		fields=["mode_of_payment", "opening_amount"]
	)
	for od in opening_details:
		opening_balances.append({
			"mode_of_payment": od.mode_of_payment,
			"opening_amount": od.opening_amount,
			"is_cash": od.mode_of_payment in cash_modes
		})

	# Closing Details if closed
	closing_balances = []
	if opening_entry.pos_closing_entry:
		closing_details = frappe.get_all("POS Closing Entry Detail",
			filters={"parent": opening_entry.pos_closing_entry},
			fields=["mode_of_payment", "opening_amount", "expected_amount", "closing_amount", "difference"]
		)
		for cd in closing_details:
			closing_balances.append({
				"mode_of_payment": cd.mode_of_payment,
				"opening_amount": cd.opening_amount,
				"expected_amount": cd.expected_amount,
				"closing_amount": cd.closing_amount,
				"difference": cd.difference,
				"is_cash": cd.mode_of_payment in cash_modes
			})

	company_currency = frappe.db.get_value("Company", opening_entry.company, "default_currency") if opening_entry.company else None
	if not company_currency:
		company_currency = frappe.db.get_default("currency") or "USD"

	return {
		"invoices": invoices,
		"payments": payment_summary,
		"opening_balances": opening_balances,
		"closing_balances": closing_balances,
		"pos_closing_entry": opening_entry.pos_closing_entry,
		"currency": company_currency
	}




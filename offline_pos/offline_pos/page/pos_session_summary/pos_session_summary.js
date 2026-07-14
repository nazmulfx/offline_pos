frappe.pages['pos-session-summary'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'POS Session Summary Report',
		single_column: true,
		hide_sidebar: true
	});

	// Add filters
	var pos_profile_filter = page.add_field({
		fieldname: 'pos_profile',
		label: __('POS Profile'),
		fieldtype: 'Link',
		options: 'POS Profile',
		change: function() {
			refresh_report();
		}
	});

	var user_filter = page.add_field({
		fieldname: 'user',
		label: __('Cashier'),
		fieldtype: 'Link',
		options: 'User',
		change: function() {
			refresh_report();
		}
	});

	var status_filter = page.add_field({
		fieldname: 'status',
		label: __('Status'),
		fieldtype: 'Select',
		options: 'All\nOpen\nClosed',
		default: 'All',
		change: function() {
			refresh_report();
		}
	});

	var from_date_filter = page.add_field({
		fieldname: 'from_date',
		label: __('From Date'),
		fieldtype: 'Date',
		default: frappe.datetime.add_days(frappe.datetime.get_today(), -1),
		change: function() {
			refresh_report();
		}
	});

	var to_date_filter = page.add_field({
		fieldname: 'to_date',
		label: __('To Date'),
		fieldtype: 'Date',
		default: frappe.datetime.get_today(),
		change: function() {
			refresh_report();
		}
	});

	// Main elements
	var container = $('<div class="pos-session-summary-container"></div>').appendTo(page.body);
	var summary_section = $('<div class="pos-summary-cards"></div>').appendTo(container);
	var table_section = $('<div class="pos-table-card"></div>').appendTo(container);

	// Helpers
	function format_amount(val) {
		return format_currency(val || 0, frappe.boot.sysdefaults.currency || 'USD');
	}

	function render_empty_state() {
		table_section.html(`
			<div class="empty-state text-center text-muted" style="padding: 40px 20px;">
				<i class="fa fa-info-circle fa-2x mb-3" style="color: var(--text-light);"></i>
				<p>${__('No POS Session records found matching the filters.')}</p>
			</div>
		`);
		summary_section.html('');
	}

	function render_table(data) {
		var total_sessions = data.length;
		var total_gross_sales = 0;
		var total_returns = 0;
		var total_net_sales = 0;

		data.forEach(function(row) {
			total_gross_sales += row.total_sales;
			total_returns += row.returns;
			total_net_sales += row.net_sales;
		});

		// Render summary cards
		summary_section.html(`
			<div class="summary-card">
				<div class="summary-icon icon-sessions"><i class="fa fa-history"></i></div>
				<div class="summary-details">
					<span class="summary-label">${__('Total Sessions')}</span>
					<span class="summary-value">${total_sessions}</span>
				</div>
			</div>
			<div class="summary-card">
				<div class="summary-icon icon-sales"><i class="fa fa-shopping-cart"></i></div>
				<div class="summary-details">
					<span class="summary-label">${__('Gross Sales')}</span>
					<span class="summary-value">${format_amount(total_gross_sales)}</span>
				</div>
			</div>
			<div class="summary-card">
				<div class="summary-icon icon-returns"><i class="fa fa-reply"></i></div>
				<div class="summary-details">
					<span class="summary-label">${__('Returns')}</span>
					<span class="summary-value">${format_amount(total_returns)}</span>
				</div>
			</div>
			<div class="summary-card">
				<div class="summary-icon icon-net"><i class="fa fa-line-chart"></i></div>
				<div class="summary-details">
					<span class="summary-label">${__('Net Sales')}</span>
					<span class="summary-value">${format_amount(total_net_sales)}</span>
				</div>
			</div>
		`);

		// Render table
		var html = `
			<div class="table-responsive">
				<table class="table table-hover pos-session-table">
					<thead>
						<tr>
							<th>${__('Session ID')}</th>
							<th>${__('Opening Time')}</th>
							<th>${__('Closing Time')}</th>
							<th>${__('Status')}</th>
							<th class="text-right">${__('Cash Sales')}</th>
							<th class="text-right">${__('Bank/Card Sales')}</th>
							<th class="text-right">${__('Credit Sales')}</th>
							<th class="text-right">${__('Total Sales')}</th>
							<th class="text-right">${__('Returns')}</th>
							<th class="text-right">${__('Net Sales')}</th>
							<th class="text-right">${__('Expected Cash')}</th>
							<th class="text-right">${__('Actual Cash')}</th>
							<th class="text-right">${__('Difference')}</th>
						</tr>
					</thead>
					<tbody>
		`;

		data.forEach(function(row) {
			var status_class = row.status === 'Open' ? 'badge-success' : 'badge-secondary';
			var diff_class = '';
			var diff_text = '-';

			if (row.difference !== null) {
				if (row.difference > 0) {
					diff_class = 'diff-positive';
					diff_text = '+' + format_amount(row.difference);
				} else if (row.difference < 0) {
					diff_class = 'diff-negative';
					diff_text = format_amount(row.difference);
				} else {
					diff_class = 'diff-zero';
					diff_text = format_amount(0);
				}
			}

			var actual_cash_text = row.actual_cash !== null ? format_amount(row.actual_cash) : '-';

			html += `
				<tr class="session-row" data-session-id="${row.session_id}">
					<td class="session-link font-weight-bold text-primary">${row.session_id}</td>
					<td>${row.opening_time ? frappe.datetime.str_to_user(row.opening_time) : ''}</td>
					<td>${row.closing_time ? frappe.datetime.str_to_user(row.closing_time) : `<span class="text-muted">${__('Still Open')}</span>`}</td>
					<td><span class="badge ${status_class}">${__(row.status)}</span></td>
					<td class="text-right">${format_amount(row.cash_sales)}</td>
					<td class="text-right">${format_amount(row.bank_card_sales)}</td>
					<td class="text-right">${format_amount(row.credit_sales)}</td>
					<td class="text-right font-weight-bold">${format_amount(row.total_sales)}</td>
					<td class="text-right text-danger">${format_amount(row.returns)}</td>
					<td class="text-right font-weight-bold text-success">${format_amount(row.net_sales)}</td>
					<td class="text-right">${format_amount(row.expected_cash)}</td>
					<td class="text-right">${actual_cash_text}</td>
					<td class="text-right font-weight-bold ${diff_class}">${diff_text}</td>
				</tr>
			`;
		});

		html += `
					</tbody>
				</table>
			</div>
		`;

		table_section.html(html);

		// Add click handler to table rows for detailed breakdown
		table_section.find('.session-row').on('click', function() {
			var session_id = $(this).attr('data-session-id');
			show_session_details(session_id);
		});
	}

	function show_session_details(session_id) {
		frappe.call({
			method: 'offline_pos.api.get_pos_session_details',
			args: {
				session_id: session_id
			},
			freeze: true,
			callback: function(r) {
				if (!r.message) return;
				var details = r.message;

				var d = new frappe.ui.Dialog({
					title: `${__('POS Session Detail')} - ${session_id}`,
					size: 'extra-large',
					fields: [
						{
							fieldtype: 'HTML',
							fieldname: 'details_html'
						}
					]
				});

				var html = `
					<div class="pos-session-modal-content">
						<!-- Summary Info -->
						<div class="modal-section-title">${__('Reconciliation & Payments')}</div>
						<div class="row">
							<!-- Cash Reconciliation -->
							<div class="col-md-6">
								<div class="reconciliation-box">
									<div class="recon-title"><i class="fa fa-money"></i> ${__('Cash Drawer Reconciliation')}</div>
									<table class="table recon-table">
										<tbody>
				`;

				var cash_opening = 0;
				var cash_expected = 0;
				var cash_closing = null;
				var cash_difference = null;

				details.opening_balances.forEach(function(b) {
					if (b.is_cash) cash_opening = b.opening_amount;
				});

				if (details.closing_balances.length > 0) {
					details.closing_balances.forEach(function(b) {
						if (b.is_cash) {
							cash_opening = b.opening_amount;
							cash_expected = b.expected_amount;
							cash_closing = b.closing_amount;
							cash_difference = b.difference;
						}
					});
				} else {
					var cash_payment_sum = 0;
					details.payments.forEach(function(p) {
						if (p.is_cash) cash_payment_sum = p.amount;
					});
					cash_expected = cash_opening + cash_payment_sum;
				}

				html += `
											<tr>
												<td>${__('Opening Balance')}</td>
												<td class="text-right font-weight-bold">${format_amount(cash_opening)}</td>
											</tr>
											<tr>
												<td>${__('Expected Cash')}</td>
												<td class="text-right font-weight-bold text-info">${format_amount(cash_expected)}</td>
											</tr>
				`;

				if (cash_closing !== null) {
					var diff_class = cash_difference > 0 ? 'text-success' : (cash_difference < 0 ? 'text-danger' : 'text-muted');
					var diff_sign = cash_difference > 0 ? '+' : '';
					html += `
											<tr>
												<td>${__('Actual Cash (Closed)')}</td>
												<td class="text-right font-weight-bold">${format_amount(cash_closing)}</td>
											</tr>
											<tr>
												<td>${__('Difference')}</td>
												<td class="text-right font-weight-bold ${diff_class}">${diff_sign}${format_amount(cash_difference)}</td>
											</tr>
					`;
				} else {
					html += `
											<tr>
												<td>${__('Actual Cash')}</td>
												<td class="text-right text-muted">- (${__('Open Session')})</td>
											</tr>
					`;
				}

				html += `
										</tbody>
									</table>
								</div>
							</div>

							<!-- Other Payments -->
							<div class="col-md-6">
								<div class="reconciliation-box">
									<div class="recon-title"><i class="fa fa-credit-card"></i> ${__('Collected Payments (Net)')}</div>
									<table class="table recon-table">
										<thead>
											<tr>
												<th>${__('Mode of Payment')}</th>
												<th class="text-right">${__('Net Collected')}</th>
											</tr>
										</thead>
										<tbody>
				`;

				if (details.payments.length > 0) {
					details.payments.forEach(function(p) {
						html += `
							<tr>
								<td>${__(p.mode_of_payment)}</td>
								<td class="text-right font-weight-bold ${p.amount < 0 ? 'text-danger' : ''}">${format_amount(p.amount)}</td>
							</tr>
						`;
					});
				} else {
					html += `
						<tr>
							<td colspan="2" class="text-muted text-center">${__('No payments recorded.')}</td>
						</tr>
					`;
				}

				html += `
										</tbody>
									</table>
								</div>
							</div>
						</div>

						<!-- Invoices List -->
						<div class="modal-section-title" style="margin-top: 25px;">${__('Invoices Created')} (${details.invoices.length})</div>
						<div class="table-responsive modal-invoice-table" style="max-height: 300px; overflow-y: auto;">
							<table class="table table-bordered table-striped table-hover">
								<thead>
									<tr>
										<th>${__('Invoice ID')}</th>
										<th>${__('Customer')}</th>
										<th>${__('Date')}</th>
										<th>${__('Type')}</th>
										<th class="text-right">${__('Grand Total')}</th>
										<th class="text-right">${__('Outstanding')}</th>
									</tr>
								</thead>
								<tbody>
				`;

				if (details.invoices.length > 0) {
					details.invoices.forEach(function(inv) {
						var type_badge = inv.is_return 
							? `<span class="badge badge-danger">${__('Return')}</span>` 
							: `<span class="badge badge-success">${__('Sales')}</span>`;
						
						html += `
							<tr>
								<td><a href="/app/sales-invoice/${inv.name}" target="_blank" class="font-weight-bold">${inv.name}</a></td>
								<td>${inv.customer || ''}</td>
								<td>${inv.posting_date ? frappe.datetime.str_to_user(inv.posting_date) : ''}</td>
								<td>${type_badge}</td>
								<td class="text-right font-weight-bold ${inv.grand_total < 0 ? 'text-danger' : ''}">${format_amount(inv.grand_total)}</td>
								<td class="text-right text-muted">${format_amount(inv.outstanding_amount)}</td>
							</tr>
						`;
					});
				} else {
					html += `
						<tr>
							<td colspan="6" class="text-muted text-center">${__('No invoices created in this session.')}</td>
						</tr>
					`;
				}

				html += `
								</tbody>
							</table>
						</div>
					</div>
				`;

				d.get_field('details_html').$wrapper.html(html);
				d.show();
			}
		});
	}

	function refresh_report() {
		var filters = {
			pos_profile: page.fields_dict.pos_profile.get_value(),
			user: page.fields_dict.user.get_value(),
			status: page.fields_dict.status.get_value(),
			from_date: page.fields_dict.from_date.get_value(),
			to_date: page.fields_dict.to_date.get_value()
		};

		frappe.call({
			method: 'offline_pos.api.get_pos_session_summary',
			args: filters,
			freeze: true,
			callback: function(r) {
				if (r.message && r.message.length > 0) {
					render_table(r.message);
				} else {
					render_empty_state();
				}
			}
		});
	}

	// Initial trigger
	refresh_report();
}
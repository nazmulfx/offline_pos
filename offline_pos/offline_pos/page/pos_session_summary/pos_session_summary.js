frappe.pages['pos-session-summary'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('POS Session Summary Report'),
		single_column: true,
		hide_sidebar: true
	});

	var reload_btn = page.add_inner_button(__('Reload'), function() {
		refresh_report();
	});
	if (reload_btn) {
		reload_btn.prepend('<i class="fa fa-refresh" style="margin-right: 5px;"></i>');
	}

	// Add filters
	var company_filter = page.add_field({
		fieldname: 'company',
		label: __('Company'),
		fieldtype: 'Link',
		options: 'Company',
		default: frappe.defaults.get_default('company'),
		change: function() {
			refresh_report();
		}
	});

	var pos_profile_filter = page.add_field({
		fieldname: 'pos_profile',
		label: __('POS Profile'),
		fieldtype: 'Link',
		options: 'POS Profile',
		get_query: function() {
			return {
				filters: {
					company: company_filter.get_value()
				}
			};
		},
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
		default: frappe.datetime.get_today(),
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

	var show_due_advance_filter = page.add_field({
		fieldname: 'show_due_advance_payment',
		label: __('Include Non-POS Payments'),
		fieldtype: 'Check',
		default: 0,
		change: function() {
			refresh_report();
		}
	});

	// Main elements
	var container = $('<div class="pos-session-summary-container"></div>').appendTo(page.body);
	var summary_section = $('<div class="pos-summary-cards"></div>').appendTo(container);
	var table_section = $('<div class="pos-table-card"></div>').appendTo(container);

	// Helpers
	function format_amount(val, currency) {
		return format_currency(val || 0, currency || frappe.boot.sysdefaults.currency || 'USD');
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

	function render_table(data, due_advance_payments) {
		var total_sessions = data ? data.length : 0;
		var total_cash_sales = 0;
		var total_bank_card_sales = 0;
		var total_credit_sales = 0;
		var total_gross_sales = 0;
		var total_returns = 0;
		var total_net_sales = 0;
		var total_expected_cash = 0;
		var total_actual_cash = 0;
		var total_difference = 0;

		(data || []).forEach(function(row) {
			total_cash_sales += row.cash_sales || 0;
			total_bank_card_sales += row.bank_card_sales || 0;
			total_credit_sales += row.credit_sales || 0;
			total_gross_sales += row.total_sales || 0;
			total_returns += row.returns || 0;
			total_net_sales += row.net_sales || 0;
			total_expected_cash += row.expected_cash || 0;
			total_actual_cash += row.actual_cash || 0;
			total_difference += row.difference || 0;
		});

		var current_currency = (data && data.length > 0) ? data[0].currency : (frappe.boot.sysdefaults.currency || 'USD');

		// Render summary cards
		var diff_class = total_difference > 0 ? 'diff-positive' : (total_difference < 0 ? 'diff-negative' : 'diff-zero');
		var diff_sign = total_difference > 0 ? '+' : '';

		var show_due_advance = page.fields_dict.show_due_advance_payment.get_value();
		var due_advance_html = '';
		if (show_due_advance && due_advance_payments && due_advance_payments.length > 0) {
			var total_due_advance = 0;
			due_advance_html += `
				<div class="due-advance-section-wrapper">
					<div class="pos-section-subtitle">
						<i class="fa fa-file-text-o"></i>
						<span>${__('Due & Advance Payments Collection (Payment Entries)')}</span>
					</div>
					<div class="pos-summary-row due-advance-row">
			`;
			due_advance_payments.forEach(function(p, idx) {
				total_due_advance += (p.amount || 0);
				var mode_lower = (p.mode_of_payment || '').toLowerCase();
				var icon_class = 'icon-bank';
				var icon_name = 'fa-credit-card';
				if (mode_lower.includes('cash')) {
					icon_class = 'icon-cash';
					icon_name = 'fa-money';
				} else if (mode_lower.includes('bank') || mode_lower.includes('card') || mode_lower.includes('credit')) {
					icon_class = 'icon-bank';
					icon_name = 'fa-credit-card';
				} else if (mode_lower.includes('wire') || mode_lower.includes('cheque') || mode_lower.includes('transfer')) {
					icon_class = 'icon-bank';
					icon_name = 'fa-university';
				}

				if (idx > 0) {
					due_advance_html += `<div class="summary-operator">+</div>`;
				}

				due_advance_html += `
					<div class="summary-card due-advance-card">
						<div class="summary-icon ${icon_class}"><i class="fa ${icon_name}"></i></div>
						<div class="summary-details">
							<span class="summary-label">${p.mode_of_payment}</span>
							<span class="summary-value">${format_amount(p.amount, current_currency)}</span>
						</div>
					</div>
				`;
			});

			due_advance_html += `
					<div class="summary-operator">=</div>
					<div class="summary-card due-advance-card due-advance-total-card">
						<div class="summary-icon icon-net"><i class="fa fa-calculator"></i></div>
						<div class="summary-details">
							<span class="summary-label">${__('Total')}</span>
							<span class="summary-value">${format_amount(total_due_advance, current_currency)}</span>
						</div>
					</div>
				</div>
			</div>`;
		} else if (show_due_advance) {
			due_advance_html += `
				<div class="due-advance-section-wrapper">
					<div class="pos-section-subtitle">
						<i class="fa fa-file-text-o"></i>
						<span>${__('Due & Advance Payments Collection (Payment Entries)')}</span>
					</div>
					<div class="pos-summary-row due-advance-row">
						<div class="summary-card due-advance-card due-advance-total-card">
							<div class="summary-icon icon-net"><i class="fa fa-calculator"></i></div>
							<div class="summary-details">
								<span class="summary-label">${__('Total Due/Advance')}</span>
								<span class="summary-value">${format_amount(0, current_currency)}</span>
							</div>
						</div>
					</div>
				</div>
			`;
		}

		summary_section.html(`
			<div class="pos-summary-row">
				<div class="summary-card">
					<div class="summary-icon icon-cash"><i class="fa fa-money"></i></div>
					<div class="summary-details">
						<span class="summary-label">${__('Cash Sales')}</span>
						<span class="summary-value">${format_amount(total_cash_sales, current_currency)}</span>
					</div>
				</div>
				<div class="summary-operator">+</div>
				<div class="summary-card">
					<div class="summary-icon icon-bank"><i class="fa fa-credit-card"></i></div>
					<div class="summary-details">
						<span class="summary-label">${__('Bank/Card Sales')}</span>
						<span class="summary-value">${format_amount(total_bank_card_sales, current_currency)}</span>
					</div>
				</div>
				<div class="summary-operator">+</div>
				<div class="summary-card">
					<div class="summary-icon icon-credit"><i class="fa fa-handshake-o"></i></div>
					<div class="summary-details">
						<span class="summary-label">${__('Credit Sales')}</span>
						<span class="summary-value">${format_amount(total_credit_sales, current_currency)}</span>
					</div>
				</div>
				<div class="summary-operator">=</div>
				<div class="summary-card">
					<div class="summary-icon icon-sales"><i class="fa fa-shopping-cart"></i></div>
					<div class="summary-details">
						<span class="summary-label">${__('Total Sales')}</span>
						<span class="summary-value">${format_amount(total_gross_sales, current_currency)}</span>
					</div>
				</div>
				<div class="summary-operator">-</div>
				<div class="summary-card">
					<div class="summary-icon icon-returns"><i class="fa fa-reply"></i></div>
					<div class="summary-details">
						<span class="summary-label">${__('Returns')}</span>
						<span class="summary-value">${format_amount(total_returns, current_currency)}</span>
					</div>
				</div>
				<div class="summary-operator">=</div>
				<div class="summary-card">
					<div class="summary-icon icon-net"><i class="fa fa-line-chart"></i></div>
					<div class="summary-details">
						<span class="summary-label">${__('Net Sales')}</span>
						<span class="summary-value">${format_amount(total_net_sales, current_currency)}</span>
					</div>
				</div>
			</div>
			<div class="pos-summary-row" style="margin-top: 20px;">
				<div class="summary-card">
					<div class="summary-icon icon-expected"><i class="fa fa-calculator"></i></div>
					<div class="summary-details">
						<span class="summary-label">${__('Expected Cash')}</span>
						<span class="summary-value">${format_amount(total_expected_cash, current_currency)}</span>
					</div>
				</div>
				<div class="summary-operator">-</div>
				<div class="summary-card">
					<div class="summary-icon icon-actual"><i class="fa fa-money"></i></div>
					<div class="summary-details">
						<span class="summary-label">${__('Actual Cash')}</span>
						<span class="summary-value">${format_amount(total_actual_cash, current_currency)}</span>
					</div>
				</div>
				<div class="summary-operator">=</div>
				<div class="summary-card">
					<div class="summary-icon icon-diff"><i class="fa fa-balance-scale"></i></div>
					<div class="summary-details">
						<span class="summary-label">${__('Difference')}</span>
						<span class="summary-value ${diff_class}">${diff_sign}${format_amount(total_difference, current_currency)}</span>
					</div>
				</div>
			</div>
			${due_advance_html}
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

		(data || []).forEach(function(row) {
			var status_class = row.status === 'Open' ? 'badge-success' : 'badge-secondary';
			var diff_class = '';
			var diff_text = '-';

			if (row.difference !== null) {
				if (row.difference > 0) {
					diff_class = 'diff-positive';
					diff_text = '+' + format_amount(row.difference, row.currency);
				} else if (row.difference < 0) {
					diff_class = 'diff-negative';
					diff_text = format_amount(row.difference, row.currency);
				} else {
					diff_class = 'diff-zero';
					diff_text = format_amount(0, row.currency);
				}
			}

			var actual_cash_text = row.actual_cash !== null ? format_amount(row.actual_cash, row.currency) : '-';

			html += `
				<tr class="session-row" data-session-id="${row.session_id}">
					<td class="session-link font-weight-bold text-primary">${row.session_id}</td>
					<td>${row.opening_time ? frappe.datetime.str_to_user(row.opening_time) : ''}</td>
					<td>${row.closing_time ? frappe.datetime.str_to_user(row.closing_time) : `<span class="text-muted">${__('Still Open')}</span>`}</td>
					<td><span class="badge ${status_class}">${__(row.status)}</span></td>
					<td class="text-right">${format_amount(row.cash_sales, row.currency)}</td>
					<td class="text-right">${format_amount(row.bank_card_sales, row.currency)}</td>
					<td class="text-right">${format_amount(row.credit_sales, row.currency)}</td>
					<td class="text-right font-weight-bold">${format_amount(row.total_sales, row.currency)}</td>
					<td class="text-right text-danger">${format_amount(row.returns, row.currency)}</td>
					<td class="text-right font-weight-bold text-success">${format_amount(row.net_sales, row.currency)}</td>
					<td class="text-right">${format_amount(row.expected_cash, row.currency)}</td>
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
				var session_currency = details.currency || frappe.boot.sysdefaults.currency || 'USD';

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
												<td class="text-right font-weight-bold">${format_amount(cash_opening, session_currency)}</td>
											</tr>
											<tr>
												<td>${__('Expected Cash')}</td>
												<td class="text-right font-weight-bold text-info">${format_amount(cash_expected, session_currency)}</td>
											</tr>
				`;

				if (cash_closing !== null) {
					var diff_class = cash_difference > 0 ? 'text-success' : (cash_difference < 0 ? 'text-danger' : 'text-muted');
					var diff_sign = cash_difference > 0 ? '+' : '';
					html += `
											<tr>
												<td>${__('Actual Cash (Closed)')}</td>
												<td class="text-right font-weight-bold">${format_amount(cash_closing, session_currency)}</td>
											</tr>
											<tr>
												<td>${__('Difference')}</td>
												<td class="text-right font-weight-bold ${diff_class}">${diff_sign}${format_amount(cash_difference, session_currency)}</td>
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
								<td class="text-right font-weight-bold ${p.amount < 0 ? 'text-danger' : ''}">${format_amount(p.amount, session_currency)}</td>
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
								<td class="text-right font-weight-bold ${inv.grand_total < 0 ? 'text-danger' : ''}">${format_amount(inv.grand_total, session_currency)}</td>
								<td class="text-right text-muted">${format_amount(inv.outstanding_amount, session_currency)}</td>
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
		var $icon = $(wrapper).find('.fa-refresh, i.fa-refresh');
		$icon.addClass('fa-spin icon-spin');

		var filters = {
			company: page.fields_dict.company.get_value(),
			pos_profile: page.fields_dict.pos_profile.get_value(),
			user: page.fields_dict.user.get_value(),
			status: page.fields_dict.status.get_value(),
			from_date: page.fields_dict.from_date.get_value(),
			to_date: page.fields_dict.to_date.get_value(),
			show_due_advance_payment: page.fields_dict.show_due_advance_payment.get_value()
		};

		frappe.call({
			method: 'offline_pos.api.get_pos_session_summary',
			args: filters,
			freeze: true,
			callback: function(r) {
				var sessions = Array.isArray(r.message) ? r.message : (r.message ? (r.message.sessions || []) : []);
				var due_advance_payments = (r.message && r.message.due_advance_payments) ? r.message.due_advance_payments : [];

				if (sessions.length > 0 || due_advance_payments.length > 0) {
					render_table(sessions, due_advance_payments);
				} else {
					render_empty_state();
				}
			},
			always: function() {
				$icon.removeClass('fa-spin icon-spin');
			}
		});
	}

	// Initial trigger
	refresh_report();
}
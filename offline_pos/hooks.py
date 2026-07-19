app_name = "offline_pos"
app_title = "Offline POS"
app_publisher = "Nazmul Hossain"
app_description = "offline functionality for ERPNext POS"
app_email = "nazmul@invento.com.bd"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "offline_pos",
# 		"logo": "/assets/offline_pos/logo.png",
# 		"title": "Offline POS",
# 		"route": "/offline_pos",
# 		"has_permission": "offline_pos.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/offline_pos/css/offline_pos.css"
# app_include_js = "/assets/offline_pos/js/offline_pos.js"

# include js, css files in header of web template
# web_include_css = "/assets/offline_pos/css/offline_pos.css"
# web_include_js = "/assets/offline_pos/js/offline_pos.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "offline_pos/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "offline_pos/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "offline_pos.utils.jinja_methods",
# 	"filters": "offline_pos.utils.jinja_filters"
# }
jinja = {
	"methods": "offline_pos.offline_pos.hooks_methods.utils.get_customer_outstanding"
}

# Installation
# ------------

# before_install = "offline_pos.install.before_install"
# after_install = "offline_pos.install.after_install"

after_migrate = [
	"offline_pos.sync_print_formats.sync_formats"
]

# Uninstallation
# ------------

# before_uninstall = "offline_pos.uninstall.before_uninstall"
# after_uninstall = "offline_pos.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "offline_pos.utils.before_app_install"
# after_app_install = "offline_pos.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "offline_pos.utils.before_app_uninstall"
# after_app_uninstall = "offline_pos.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "offline_pos.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }
doc_events = {
	"Sales Invoice": {
		"before_validate": "offline_pos.offline_pos.hooks_methods.sales_invoice.before_validate",
	},
	"Purchase Receipt": {
		"validate": "offline_pos.offline_pos.hooks_methods.purchase_receipt.validate",
	},
	"Stock Entry": {
		"validate": "offline_pos.offline_pos.hooks_methods.stock_entry.validate",
	},
	"GL Entry": {
		"on_update": "offline_pos.offline_pos.hooks_methods.utils.on_gl_entry",
		"on_cancel": "offline_pos.offline_pos.hooks_methods.utils.on_gl_entry",
	}
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"offline_pos.tasks.all"
# 	],
# 	"daily": [
# 		"offline_pos.tasks.daily"
# 	],
# 	"hourly": [
# 		"offline_pos.tasks.hourly"
# 	],
# 	"weekly": [
# 		"offline_pos.tasks.weekly"
# 	],
# 	"monthly": [
# 		"offline_pos.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "offline_pos.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "offline_pos.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
override_whitelisted_methods = {
	"erpnext.selling.page.point_of_sale.point_of_sale.get_items": "offline_pos.api.get_items"
}
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "offline_pos.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["offline_pos.utils.before_request"]
# after_request = ["offline_pos.utils.after_request"]

# Job Events
# ----------
# before_job = ["offline_pos.utils.before_job"]
# after_job = ["offline_pos.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"offline_pos.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

fixtures = [
    {
        "dt": "Customer",
        "filters": [["name", "in", 
			["Walk-In-Customer"]
        ]]
    },
	{
        "dt": "Role Profile",
        "filters": [["name", "in", 
			["Offline POS"]
        ]]
    },
]


website_route_rules = [{'from_route': '/offline-pos/<path:app_path>', 'to_route': 'offline-pos'}]

page_renderer = ["offline_pos.pwa.PWARenderer"]
# Copyright (c) 2026, Nazmul Hossain and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class PartyBalance(Document):
	def autoname(self):
		self.name = f"{self.abbr}-{self.party_type}-{self.party}"


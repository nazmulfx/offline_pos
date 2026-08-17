import re
import time
import uuid
import frappe

from frappe.utils import flt
from . utils import get_customer_outstanding

def before_validate(doc, method=None):
    """
    On Amended From, unique id prevents saving same id twice. so make it empty to prevent validation error
    """
    if doc.amended_from and doc.custom_offline_id:
        doc.custom_offline_id = ''

    if doc.amended_from and doc.is_new():
        fetch_payments_from_older_invoice(doc)

    set_outstanding_on_creation(doc)

def before_submit(doc, method=None):
    doc.previous_outstanding = get_customer_outstanding(doc.customer, doc.company)
    set_outstanding_on_creation(doc)

def set_outstanding_on_creation(doc):
    total = flt(doc.rounded_total) if doc.rounded_total else flt(doc.grand_total)
    paid = flt(doc.paid_amount)
    doc.outstanding_on_invoice_creation = total - paid


def fetch_payments_from_older_invoice(doc):
    if not doc.amended_from:
        return

    old_doc = frappe.get_doc("Sales Invoice", doc.amended_from)
    if old_doc.get("payments"):
        doc.set("payments", [])
        for payment in old_doc.payments:
            p_dict = payment.as_dict()
            for key in ["name", "parent", "parentfield", "parenttype", "owner", "creation", "modified", "modified_by", "idx"]:
                p_dict.pop(key, None)
            doc.append("payments", p_dict)
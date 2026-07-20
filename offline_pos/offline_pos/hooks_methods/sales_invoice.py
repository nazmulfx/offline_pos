import re
import time
import uuid
import frappe

from . utils import get_customer_outstanding

def before_validate(doc, method=None):
    """
    On Amended From, unique id prevents saving same id twice. so make it empty to prevent validation error
    """
    if doc.amended_from and doc.custom_offline_id:
        doc.custom_offline_id = ''

def before_submit(doc, method=None):
    doc.previous_outstanding = get_customer_outstanding(doc.customer, doc.company)
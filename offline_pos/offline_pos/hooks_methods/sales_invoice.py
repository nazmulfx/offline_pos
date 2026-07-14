import re
import time
import uuid
import frappe


def before_validate(doc, method=None):
    """
    On Amended From, unique id prevents saving same id twice. so make it empty to prevent validation error
    """
    if doc.amended_from and doc.custom_offline_id:
        doc.custom_offline_id = ''

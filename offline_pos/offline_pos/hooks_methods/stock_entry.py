import frappe

from . purchase_receipt import assign_batch, process_batch

def validate(doc, method="None"):
    process_batch(doc)
    assign_batch(doc)

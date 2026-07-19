import frappe
import os

def sync_formats():
    base_path = os.path.join(frappe.get_app_path("offline_pos"), "offline_pos", "print_format")
    
    # 1. Standard Print format
    spf_path = os.path.join(base_path, "standard_print_format", "standard_print_format.html")
    with open(spf_path, "r") as f:
        spf_html = f.read()
    
    spf_doc = frappe.get_doc("Print Format", "Standard Print format")
    spf_doc.html = spf_html
    spf_doc.custom_format = 1
    spf_doc.save(ignore_permissions=True)
    
    # 2. POS Invoice with Due Feature
    pid_path = os.path.join(base_path, "pos_invoice_with_due_feature", "pos_invoice_with_due_feature.html")
    with open(pid_path, "r") as f:
        pid_html = f.read()
        
    pid_doc = frappe.get_doc("Print Format", "POS Invoice with Due Feature")
    pid_doc.html = pid_html
    pid_doc.custom_format = 1
    pid_doc.save(ignore_permissions=True)
    
    frappe.db.commit()
    print("Successfully synced print formats dynamically!")

if __name__ == "__main__":
    sync_formats()

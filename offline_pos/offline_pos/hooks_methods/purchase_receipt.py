import frappe

def validate(doc, method="None"):
    process_batch(doc)
    assign_batch(doc)

def process_batch(doc):
    for item in doc.items:
        ##  First Create Batch
        if item.new_batch and item.use_serial_batch_fields:
            if not frappe.db.exists("Batch", item.new_batch):
                print('Batch Creation Executed')
                new_batch_id = frappe.new_doc("Batch")
                new_batch_id.batch_id = item.new_batch
                new_batch_id.item = item.item_code
                # new_batch_id.stock_uom = item.uom
                new_batch_id.expiry_date = item.exp_date

                new_batch_id.save()

def assign_batch(doc):
    for item in doc.items:
        ##  Assign Batch to Batch id in Item
        item.batch_no = item.new_batch


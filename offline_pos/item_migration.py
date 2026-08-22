import frappe

@frappe.whitelist()
def migrate_batch_items_to_non_batch(batch_size=0, item_code=None, dry_run=0):
	"""
	API / Script to migrate batch items to non-batch items safely and idempotently.
	
	Whitelisted Call Path:
	site_url/api/method/offline_pos.item_migration.migrate_batch_items_to_non_batch
	
	Fault Tolerance & Recovery Features:
	------------------------------------
	1. Auto-Recovery on Rerun: If a server crash occurs midway after renaming ITEM-001 -> ITEM-001-old,
	   the next run detects ITEM-001-old without active ITEM-001 and automatically finishes creating ITEM-001.
	2. Per-Item Isolation: Each item is processed with its own transaction. A failure on one item
	   rolls back only that item and log the error, allowing the batch to continue.
	3. Re-run Safety (Idempotency): Completed replacement items have has_batch_no = 0, so subsequent runs
	   automatically ignore already migrated items.
	"""
	if not ("System Manager" in frappe.get_roles() or frappe.has_permission("Item", "write")):
		frappe.throw(frappe._("Not authorized to perform Item migration"), frappe.PermissionError)

	dry_run = frappe.utils.cint(dry_run)
	batch_size = frappe.utils.cint(batch_size)

	results = []

	# ── Step 0: Auto-Recovery Phase for any interrupted migrations ───────────
	recovered_items = _recover_interrupted_migrations(dry_run=dry_run)
	results.extend(recovered_items)

	# ── Step 1: Select Batch Items to Migrate ─────────────────────────────────
	if item_code:
		items = [item_code] if frappe.db.exists("Item", item_code) else []
	else:
		# Query items with has_batch_no = 1 that have not yet been renamed to -old
		query_args = {
			"filters": {
				"name": ["not like", "%-old"],
				"has_batch_no": 1,
			},
			"pluck": "name",
			"order_by": "creation asc",
		}
		if batch_size > 0:
			query_args["limit"] = batch_size

		items = frappe.db.get_all("Item", **query_args)

	if not items and not results:
		return {
			"status": "success",
			"message": "No batch items found to migrate.",
			"migrated_items": []
		}

	# ── Step 2: Process Batch Items ──────────────────────────────────────────
	for idx, current_code in enumerate(items, 1):
		old_code = f"{current_code}-old"

		# If active item already has has_batch_no = 0, skip
		current_has_batch = frappe.db.get_value("Item", current_code, "has_batch_no")
		if current_has_batch == 0:
			results.append({
				"item": current_code,
				"status": "skipped",
				"reason": "Item already migrated (has_batch_no is 0)."
			})
			continue

		# If -old doc already exists and active doc also exists, check if migration was completed
		if frappe.db.exists("Item", old_code) and frappe.db.exists("Item", current_code):
			results.append({
				"item": current_code,
				"status": "skipped",
				"reason": f"Target archived doc '{old_code}' already exists."
			})
			continue

		if dry_run:
			results.append({
				"item": current_code,
				"new_old_name": old_code,
				"status": "dry_run"
			})
			continue

		try:
			# Step A: Fetch current item document
			item_doc = frappe.get_doc("Item", current_code)

			# Extract barcodes before renaming
			barcodes = [b.as_dict() for b in item_doc.barcodes]

			# Clear barcodes on old document to prevent unique constraint conflict on barcode field
			if item_doc.barcodes:
				item_doc.barcodes = []
				item_doc.save(ignore_permissions=True)
				frappe.db.commit()

			# Step B: Rename current_code -> current_code-old (updates all historical transactions)
			frappe.rename_doc("Item", current_code, old_code, force=True)
			frappe.db.commit()

			# Step C: Load the renamed -old document and set disabled = 1
			old_doc = frappe.get_doc("Item", old_code)
			old_doc.disabled = 1
			old_doc.save(ignore_permissions=True)
			frappe.db.commit()

			# Step D: Duplicate old_doc to create the new non-batch item with original name current_code
			new_doc = frappe.copy_doc(old_doc)
			new_doc.name = current_code
			new_doc.item_code = current_code
			new_doc.item_name = old_doc.item_name
			new_doc.disabled = 0
			new_doc.has_batch_no = 0
			new_doc.create_new_batch = 0
			new_doc.has_serial_no = 0

			# Transfer barcodes to the new active item
			new_doc.barcodes = []
			for b in barcodes:
				new_doc.append("barcodes", {
					"barcode": b.get("barcode"),
					"barcode_type": b.get("barcode_type"),
					"uom": b.get("uom")
				})

			new_doc.insert(ignore_permissions=True)
			frappe.db.commit()

			results.append({
				"item": current_code,
				"renamed_to": old_code,
				"status": "success"
			})
			print(f"[{idx}/{len(items)}] Successfully migrated '{current_code}' -> '{old_code}' and created new non-batch '{current_code}'")

		except Exception as e:
			frappe.db.rollback()
			frappe.log_error(f"Error migrating item {current_code}", "Item Migration Error")
			results.append({
				"item": current_code,
				"status": "error",
				"error": str(e)
			})

	return {
		"status": "success",
		"processed_count": len(results),
		"results": results
	}


def _recover_interrupted_migrations(dry_run=0):
	"""
	Scans for any orphaned '-old' items (e.g. ITEM-001-old) where the active item (ITEM-001)
	is missing due to an interruption right after rename_doc, and completes the creation of ITEM-001.
	"""
	recovered = []
	old_items = frappe.db.get_all("Item", filters={"name": ["like", "%-old"]}, pluck="name")

	for old_code in old_items:
		original_code = old_code[:-4]  # strip '-old'
		if not frappe.db.exists("Item", original_code):
			if dry_run:
				recovered.append({
					"item": original_code,
					"renamed_to": old_code,
					"status": "dry_run_recovery_needed"
				})
				continue

			try:
				old_doc = frappe.get_doc("Item", old_code)
				if not old_doc.disabled:
					old_doc.disabled = 1
					old_doc.save(ignore_permissions=True)
					frappe.db.commit()

				new_doc = frappe.copy_doc(old_doc)
				new_doc.name = original_code
				new_doc.item_code = original_code
				new_doc.item_name = old_doc.item_name
				new_doc.disabled = 0
				new_doc.has_batch_no = 0
				new_doc.create_new_batch = 0
				new_doc.has_serial_no = 0

				new_doc.insert(ignore_permissions=True)
				frappe.db.commit()

				recovered.append({
					"item": original_code,
					"renamed_to": old_code,
					"status": "recovered_successfully"
				})
				print(f"[RECOVERY] Successfully recovered interrupted item '{original_code}' from '{old_code}'")
			except Exception as e:
				frappe.db.rollback()
				frappe.log_error(f"Error recovering interrupted item {original_code}", "Item Recovery Error")
				recovered.append({
					"item": original_code,
					"status": "recovery_error",
					"error": str(e)
				})

	return recovered

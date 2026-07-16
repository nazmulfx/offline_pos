/**
 * customerService.ts — Fetch / create customers: online or offline
 *
 * Offline create:
 *  - Generates a temporary local ID (OFFLINE-<timestamp>-<random>)
 *  - Saves to IndexedDB cache so it appears in the list immediately
 *  - Queues a 'save_customer' action in the sync queue
 *  - Returns the local customer object so it can be selected & used in invoices
 *
 * Sync order:
 *  - syncStore processes 'save_customer' items BEFORE 'submit_invoice' items
 *  - After a customer syncs, any queued invoices that reference the temp name
 *    are updated with the real ERPNext customer name
 */
import call from '../lib/call';
import { cacheCustomers, getCachedCustomers, addToSyncQueue, updateCustomerNameInQueue } from '../db/posDB';

interface FetchCustomersOptions {
  search?: string;
  isOnline: boolean;
  customerGroups?: string[];
}

export async function fetchCustomers(opts: FetchCustomersOptions): Promise<any[]> {
  const { search = '', isOnline, customerGroups = [] } = opts;

  if (isOnline) {
    try {
      console.log(`[CustomerService] Fetching customer list matching "${search}" from server...`);
      const filters: Record<string, any> = { disabled: 0 };
      if (customerGroups.length) {
        filters.customer_group = ['in', customerGroups];
      }

      const result = await call('frappe.client.get_list', {
        doctype: 'Customer',
        filters,
        or_filters: search
          ? {
              customer_name: ['like', `%${search}%`],
              name: ['like', `%${search}%`],
              mobile_no: ['like', `%${search}%`],
            }
          : undefined,
        fields: ['name', 'customer_name', 'mobile_no', 'email_id', 'customer_group', 'loyalty_program'],
        limit_page_length: 50,
      });

      const customers: any[] = result || [];
      if (customers.length > 0) {
        await cacheCustomers(customers);
      }
      return customers;
    } catch (err) {
      console.warn('[CustomerService] API failed, falling back to IndexedDB:', err);
    }
  }

  return getCachedCustomers(search);
}

export interface CreateCustomerData {
  customer_name: string;
  mobile_no?: string;
  email_id?: string;
  customer_group?: string;   // Should be a leaf-level (non-group) Customer Group
}

export interface CreateCustomerResult {
  customer: any;
  offline: boolean;
  localTempName?: string;
}

/**
 * Create a customer — online or offline.
 *
 * Online:  frappe.client.save → returns real ERPNext customer document
 * Offline: generates temp name, caches locally, queues for sync
 */
export async function createCustomer(
  data: CreateCustomerData,
  isOnline: boolean
): Promise<CreateCustomerResult> {
  const doc = {
    doctype: 'Customer',
    customer_name: data.customer_name,
    customer_type: 'Individual',
    // 'All Customer Groups' is a group-type node — ERPNext rejects it.
    // Use the caller-supplied group (from POS profile), then 'Individual',
    // which is always a non-group leaf in standard ERPNext setups.
    customer_group: data.customer_group || 'Individual',
    territory: 'All Territories',
    mobile_no: data.mobile_no || '',
    email_id: data.email_id || '',
  };

  if (isOnline) {
    const saved = await call('frappe.client.save', { doc });
    if (saved) await cacheCustomers([saved]);
    return { customer: saved, offline: false };
  }

  // ── Offline path ─────────────────────────────────────────────
  // Generate a deterministic temp name so we can update references later
  const tempName = `OFFLINE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const localCustomer = {
    ...doc,
    name: tempName,
    _offline: true,        // flag to distinguish from real ERPNext customers
    _temp_name: tempName,
  };

  // Save to IndexedDB so it appears in the customer list immediately
  await cacheCustomers([localCustomer]);

  // Queue for sync — includes the temp name so syncStore can update references
  await addToSyncQueue('save_customer', {
    doc,
    temp_name: tempName,   // used to rewrite invoice customer field after sync
  });

  console.log('[CustomerService] Customer queued offline:', tempName);
  return { customer: localCustomer, offline: true, localTempName: tempName };
}

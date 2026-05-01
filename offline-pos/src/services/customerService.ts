/**
 * customerService.ts — Fetch customers: online or offline
 */
import call from '../lib/call';
import { cacheCustomers, getCachedCustomers } from '../db/posDB';

interface FetchCustomersOptions {
  search?: string;
  isOnline: boolean;
  customerGroups?: string[];
}

export async function fetchCustomers(opts: FetchCustomersOptions): Promise<any[]> {
  const { search = '', isOnline, customerGroups = [] } = opts;

  if (isOnline) {
    try {
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

export async function createCustomer(data: {
  customer_name: string;
  mobile_no?: string;
  email_id?: string;
  customer_group?: string;
}): Promise<any> {
  const doc = {
    doctype: 'Customer',
    customer_name: data.customer_name,
    customer_type: 'Individual',
    customer_group: data.customer_group || 'All Customer Groups',
    territory: 'All Territories',
    mobile_no: data.mobile_no || '',
    email_id: data.email_id || '',
  };

  const saved = await call('frappe.client.save', { doc });
  // Cache the new customer
  if (saved) await cacheCustomers([saved]);
  return saved;
}

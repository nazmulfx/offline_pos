/**
 * syncStore.ts — Sync queue management (Pinia)
 *
 * Sync order:
 *   1. save_customer items FIRST — so customers exist in ERPNext
 *      before invoices that reference them are submitted
 *   2. After each customer syncs, update any queued invoice's customer
 *      field from the temp offline name to the real ERPNext name
 *   3. submit_invoice items SECOND
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  getSyncQueue,
  removeSyncItem,
  getSyncQueueCount,
  markInvoiceSynced,
  updateCustomerNameInQueue,
  removeOfflineCustomer,
} from '../db/posDB';
import call from '../lib/call';

export const useSyncStore = defineStore('sync', () => {
  const pendingCount = ref<number>(0);
  const isSyncing = ref<boolean>(false);
  const lastSyncAt = ref<Date | null>(null);
  const syncError = ref<string | null>(null);
  const failedItems = ref<number[]>([]);

  async function refreshPendingCount() {
    pendingCount.value = await getSyncQueueCount();
  }

  async function addToQueue(action: string, payload: any) {
    const { addToSyncQueue } = await import('../db/posDB');
    await addToSyncQueue(action, payload);
    await refreshPendingCount();
  }

  /** Refresh CSRF token before syncing to avoid stale-token 403 */
  async function refreshCSRFToken(): Promise<void> {
    try {
      const res = await fetch('/api/method/frappe.auth.get_logged_user', {
        method: 'GET',
        headers: { 'X-Frappe-Site-Name': window.location.hostname },
        credentials: 'include',
      });
      if (res.ok) {
        const newCsrf = res.headers.get('X-Frappe-CSRF-Token');
        if (newCsrf) (window as any).csrf_token = newCsrf;
      }
    } catch {
      // Non-fatal — continue with existing token
    }
  }

  function isAuthenticated(): boolean {
    const cookies = Object.fromEntries(
      document.cookie.split('; ').filter(Boolean).map((part) => {
        const [k, ...v] = part.split('=');
        return [k, decodeURIComponent(v.join('='))];
      })
    );
    return !!cookies.user_id && cookies.user_id !== 'Guest';
  }

  async function syncAll() {
    if (isSyncing.value) return;
    if (!isAuthenticated()) {
      console.warn('[SyncStore] syncAll() skipped — not authenticated.');
      return;
    }

    const allItems = await getSyncQueue();
    if (!allItems.length) {
      pendingCount.value = 0;
      return;
    }

    isSyncing.value = true;
    syncError.value = null;
    failedItems.value = [];

    await refreshCSRFToken();

    // ── STEP 1: Sync customers first ────────────────────────────
    const customerItems = allItems.filter(i => i.action === 'save_customer');
    const invoiceItems  = allItems.filter(i => i.action === 'submit_invoice');
    const otherItems    = allItems.filter(i => i.action !== 'save_customer' && i.action !== 'submit_invoice');

    const errors: string[] = [];

    for (const item of customerItems) {
      try {
        const realCustomer = await syncCustomerItem(item);

        // Relink any queued invoices that used this customer's temp name
        if (item.payload?.temp_name && realCustomer?.name) {
          await updateCustomerNameInQueue(item.payload.temp_name, realCustomer.name);
          // Remove the offline placeholder from customer cache
          await removeOfflineCustomer(item.payload.temp_name);
          console.log('[SyncStore] Customer synced:', item.payload.temp_name, '→', realCustomer.name);
        }

        await removeSyncItem(item.id);
      } catch (err: any) {
        failedItems.value.push(item.id);
        errors.push('Customer: ' + extractErrorMessage(err));
        console.error('[SyncStore] Customer sync failed id=' + item.id, err);
        if (isAuthError(err)) {
          syncError.value = 'Authentication error. Please refresh the page.';
          isSyncing.value = false;
          await refreshPendingCount();
          return;
        }
      }
    }

    // ── STEP 2: Sync invoices ────────────────────────────────────
    // Re-fetch queue — invoice customer names may have been updated in Step 1
    const updatedInvoiceItems = invoiceItems.length > 0
      ? (await getSyncQueue()).filter(i => i.action === 'submit_invoice')
      : [];

    for (const item of updatedInvoiceItems) {
      try {
        await syncInvoiceItem(item);
        await removeSyncItem(item.id);
      } catch (err: any) {
        failedItems.value.push(item.id);
        errors.push('Invoice: ' + extractErrorMessage(err));
        console.error('[SyncStore] Invoice sync failed id=' + item.id, err);
        if (isAuthError(err)) {
          syncError.value = 'Authentication error. Please refresh the page.';
          break;
        }
        // Continue other invoices even if one fails
      }
    }

    // ── STEP 3: Other actions ────────────────────────────────────
    for (const item of otherItems) {
      try {
        await call('frappe.client.insert', { doc: item.payload }, { skipAuthRedirect: true });
        await removeSyncItem(item.id);
      } catch (err: any) {
        errors.push(extractErrorMessage(err));
      }
    }

    isSyncing.value = false;
    lastSyncAt.value = new Date();
    await refreshPendingCount();

    if (errors.length > 0) syncError.value = errors.join('\n');

    const remaining = await getSyncQueueCount();
    console.log(`[SyncStore] Sync done — pending: ${remaining}, errors: ${errors.length}`);
  }

  async function syncCustomerItem(item: any): Promise<any> {
    const { doc } = item.payload;
    // Use frappe.client.insert (not save) — save requires name, insert auto-generates it
    const saved = await call('frappe.client.insert', { doc }, { skipAuthRedirect: true });
    return saved;
  }

  async function syncInvoiceItem(item: any): Promise<void> {
    const { invoice, local_id } = item.payload;

    const insertedDoc = await call(
      'frappe.client.insert',
      { doc: invoice },
      { skipAuthRedirect: true }
    );
    if (!insertedDoc?.name) throw new Error('Insert returned no document');

    await call('frappe.client.submit', { doc: insertedDoc }, { skipAuthRedirect: true });

    if (local_id) await markInvoiceSynced(local_id);
  }

  function extractErrorMessage(err: any): string {
    const messages: string[] = err?.messages || [];
    if (messages.length > 0) return messages.join(' | ');
    return err?.message || 'Unknown error';
  }

  function isAuthError(err: any): boolean {
    const msg = (err?.message || '').toLowerCase();
    return (
      err?.status === 401 || err?.status === 403 ||
      msg.includes('not logged') || msg.includes('session') ||
      err?.exc_type === 'AuthenticationError' ||
      err?.exc_type === 'PermissionError'
    );
  }

  return {
    pendingCount,
    isSyncing,
    lastSyncAt,
    syncError,
    failedItems,
    addToQueue,
    syncAll,
    refreshPendingCount,
  };
});

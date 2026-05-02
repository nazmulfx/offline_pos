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
  // Map of sync-queue item id → error message from the last sync attempt
  const failedItems = ref<Record<number, string>>({});

  async function refreshPendingCount() {
    pendingCount.value = await getSyncQueueCount();
  }

  async function addToQueue(action: string, payload: any) {
    const { addToSyncQueue } = await import('../db/posDB');
    await addToSyncQueue(action, payload);
    await refreshPendingCount();
  }

  /**
   * Refresh CSRF token before syncing to avoid stale-token 400/403.
   * Uses a POST so Frappe always returns a fresh X-Frappe-CSRF-Token header.
   * Also falls back to reading the csrf_token cookie Frappe sets on login.
   */
  async function refreshCSRFToken(): Promise<void> {
    try {
      // First try: read from frappe's __csrf_token cookie (most reliable)
      const cookieToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('__csrf_token='))
        ?.split('=')?.[1];
      if (cookieToken && cookieToken !== 'undefined') {
        (window as any).csrf_token = decodeURIComponent(cookieToken);
        return;
      }

      // Second try: POST to get_logged_user — Frappe always returns a fresh token
      const res = await fetch('/api/method/frappe.auth.get_logged_user', {
        method: 'POST',
        headers: {
          'X-Frappe-Site-Name': window.location.hostname,
          'Content-Type': 'application/json; charset=utf-8',
        },
        credentials: 'include',
        body: '{}',
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
    failedItems.value = {};  // reset per-item errors

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
          const tempName = item.payload.temp_name;
          const realName = realCustomer.name;

          // ── Primary fix: update in-memory invoiceItems RIGHT NOW ──────────
          // This ensures Step 2 always has the real customer name regardless of
          // any IndexedDB read lag after updateCustomerNameInQueue commits.
          for (const inv of invoiceItems) {
            if (inv.payload?.invoice?.customer === tempName) {
              inv.payload.invoice.customer = realName;
              console.log(`[SyncStore] In-memory patch: invoice id=${inv.id} customer ${tempName} → ${realName}`);
            }
          }

          // ── Also persist to IndexedDB for durability ───────────────────────
          // (Fixed: now only resolves on tx.oncomplete, not req.onsuccess)
          await updateCustomerNameInQueue(tempName, realName);
          await removeOfflineCustomer(tempName);
          console.log('[SyncStore] Customer synced:', tempName, '→', realName);
        }

        await removeSyncItem(item.id);
      } catch (err: any) {
        const msg = extractErrorMessage(err);
        failedItems.value[item.id] = msg;
        errors.push('Customer: ' + msg);
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
    // Use the in-memory invoiceItems (already patched above with real customer names).
    // No need to re-fetch from IndexedDB — in-memory state is always up-to-date.
    for (const item of invoiceItems) {
      // Safety guard: skip invoices whose customer is still an offline temp name.
      // This only happens when the customer sync itself failed — retry next cycle.
      const invoiceCustomer = item.payload?.invoice?.customer || '';
      if (invoiceCustomer.startsWith('OFFLINE-')) {
        const blockedMsg = `Waiting for customer "${invoiceCustomer}" to sync first before this invoice can be submitted.`;
        console.warn(`[SyncStore] Skipping invoice id=${item.id} — customer not yet synced: ${invoiceCustomer}`);
        errors.push(`Invoice id=${item.id} skipped — customer not yet synced.`);
        failedItems.value[item.id] = blockedMsg;
        continue;
      }

      try {
        await syncInvoiceItem(item);
        await removeSyncItem(item.id);
      } catch (err: any) {
        const msg = extractErrorMessage(err);
        failedItems.value[item.id] = msg;
        errors.push('Invoice: ' + msg);
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
    refreshCSRFToken,
  };
});

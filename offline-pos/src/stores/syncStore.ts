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
import { auth } from '../lib/auth';
import router from '../router';
import { usePOSStore } from './posStore';

export const useSyncStore = defineStore('sync', () => {
  const pendingCount = ref<number>(0);
  const isSyncing = ref<boolean>(false);
  const lastSyncAt = ref<Date | null>(null);
  const syncError = ref<string | null>(null);
  // Map of sync-queue item id → error message from the last sync attempt
  const failedItems = ref<Record<number, string>>({});
  const lastSyncedInvoiceCount = ref<number>(0);

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

      // Second try: GET to get_logged_user — Frappe returns a fresh token
      const res = await fetch('/api/method/frappe.auth.get_logged_user', {
        method: 'GET',
        headers: {
          'X-Frappe-Site-Name': window.location.hostname,
          'Accept': 'application/json',
        },
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
    if (isSyncing.value) {
      try {
        const posStore = usePOSStore();
        posStore.showAlert('Sync Status', 'Sync already started successfully.', 'info');
      } catch (err) {
        console.warn('[SyncStore] Failed to show sync already started alert:', err);
      }
      return { customers: 0, invoices: 0, others: 0, errorCount: 0 };
    }
    if (!isAuthenticated()) {
      console.warn('[SyncStore] syncAll() skipped — not authenticated.');
      return { customers: 0, invoices: 0, others: 0, errorCount: 0 };
    }

    // Lock synchronously before any async operations to prevent race conditions
    isSyncing.value = true;
    syncError.value = null;
    failedItems.value = {};  // reset per-item errors
    lastSyncedInvoiceCount.value = 0;

    let syncedCustomers = 0;
    let syncedInvoices = 0;
    let syncedOthers = 0;

    try {
      const allItems = await getSyncQueue();
      if (!allItems.length) {
        pendingCount.value = 0;
        return { customers: 0, invoices: 0, others: 0, errorCount: 0 };
      }

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
          syncedCustomers++;
        } catch (err: any) {
          const msg = extractErrorMessage(err);
          failedItems.value[item.id] = msg;
          errors.push('Customer: ' + msg);
          console.error('[SyncStore] Customer sync failed id=' + item.id, err);
          if (isAuthError(err)) {
            syncError.value = 'Session expired. Please log in again to sync.';
            auth.clearLocalCookies();
            router.push({
              name: 'Login',
              query: {
                route: router.currentRoute.value.path,
                message: 'Session expired. Please log in again to sync.'
              }
            });
            return { customers: syncedCustomers, invoices: syncedInvoices, others: syncedOthers, errorCount: errors.length };
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
          lastSyncedInvoiceCount.value++;
          syncedInvoices++;
        } catch (err: any) {
          const msg = extractErrorMessage(err);
          failedItems.value[item.id] = msg;
          errors.push('Invoice: ' + msg);
          console.error('[SyncStore] Invoice sync failed id=' + item.id, err);
          if (isAuthError(err)) {
            syncError.value = 'Session expired. Please log in again to sync.';
            auth.clearLocalCookies();
            router.push({
              name: 'Login',
              query: {
                route: router.currentRoute.value.path,
                message: 'Session expired. Please log in again to sync.'
              }
            });
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
          syncedOthers++;
        } catch (err: any) {
          errors.push(extractErrorMessage(err));
        }
      }

      if (errors.length > 0) syncError.value = errors.join('\n');

      const remaining = await getSyncQueueCount();
      console.log(`[SyncStore] Sync done — pending: ${remaining}, errors: ${errors.length}`);

      // Refresh serial/batch data from server after sync finishes
      const posStore = usePOSStore();
      try {
        await posStore.refreshSerialBatchDataFromServer();
      } catch (e) {
        console.warn('[SyncStore] Failed to refresh serial/batch data after sync:', e);
      }

      return {
        customers: syncedCustomers,
        invoices: syncedInvoices,
        others: syncedOthers,
        errorCount: errors.length,
      };
    } finally {
      isSyncing.value = false;
      lastSyncAt.value = new Date();
      await refreshPendingCount();
    }
  }

  async function syncCustomerItem(item: any): Promise<any> {
    const { doc } = item.payload;
    // Use frappe.client.insert (not save) — save requires name, insert auto-generates it
    const saved = await call('frappe.client.insert', { doc }, { skipAuthRedirect: true });
    return saved;
  }

  async function syncInvoiceItem(item: any): Promise<void> {
    const { invoice, local_id } = item.payload;

    if (invoice) {
      invoice.update_stock = 1;
    }

    let docToSubmit = null;
    if (invoice.name) {
      // Already inserted! Get the latest doc from the server to submit it
      try {
        docToSubmit = await call(
          'frappe.client.get',
          { doctype: invoice.doctype || 'POS Invoice', name: invoice.name },
          { skipAuthRedirect: true }
        );
      } catch (err: any) {
        // If not found, it might have been deleted or not actually inserted
        if (err.status === 404) {
          docToSubmit = null;
        } else {
          throw err;
        }
      }
    }

    if (!docToSubmit && invoice.custom_offline_id) {
      try {
        const existing = await call(
          'frappe.client.get_list',
          {
            doctype: invoice.doctype || 'POS Invoice',
            filters: { custom_offline_id: invoice.custom_offline_id },
            fields: ['name', 'docstatus'],
            limit_page_length: 1
          },
          { skipAuthRedirect: true }
        );
        if (existing && existing.length > 0) {
          const name = existing[0].name;
          console.log(`[SyncStore] Found existing invoice on server with custom_offline_id ${invoice.custom_offline_id}: ${name}`);
          invoice.name = name;
          const { updateSyncItemInvoiceName } = await import('../db/posDB');
          await updateSyncItemInvoiceName(item.id, name);

          docToSubmit = await call(
            'frappe.client.get',
            { doctype: invoice.doctype || 'POS Invoice', name },
            { skipAuthRedirect: true }
          );
        }
      } catch (err) {
        console.warn('[SyncStore] Failed to query existing invoice by custom_offline_id:', err);
      }
    }

    if (!docToSubmit) {
      const insertedDoc = await call(
        'frappe.client.insert',
        { doc: invoice },
        { skipAuthRedirect: true }
      );
      if (!insertedDoc?.name) throw new Error('Insert returned no document');
      docToSubmit = insertedDoc;

      // Update the queue item's invoice name so that if submit fails next, we don't re-insert it
      invoice.name = insertedDoc.name;
      const { updateSyncItemInvoiceName } = await import('../db/posDB');
      await updateSyncItemInvoiceName(item.id, insertedDoc.name);
    }

    if (docToSubmit.docstatus === 1) {
      console.log(`[SyncStore] Invoice ${docToSubmit.name} is already submitted on server.`);
    } else {
      await call('frappe.client.submit', { doc: docToSubmit }, { skipAuthRedirect: true });
    }

    if (local_id) await markInvoiceSynced(local_id);
  }

  function extractErrorMessage(err: any): string {
    const raw: string = err?.exc || err?.message || err?.toString() || '';

    // Handle CSRF Token expiration / Invalid Request
    if (raw.includes('CSRFTokenError') || raw.includes('Invalid Request')) {
      return 'Session expired. Please log in again.';
    }

    const messages: string[] = err?.messages || [];
    if (messages.length > 0) return messages.join(' | ');

    if (raw.includes('Traceback (most recent call last):')) {
      const genericExceptionMatch = raw.match(/[a-zA-Z.]+Error:\s*(.+?)(?:\n|$)/);
      if (genericExceptionMatch) return genericExceptionMatch[1].trim();
      return 'Server error occurred during sync.';
    }

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
    lastSyncedInvoiceCount,
  };
});

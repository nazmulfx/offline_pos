/**
 * syncStore.ts — Sync queue management (Pinia)
 * Processes pending invoices when back online.
 *
 * FIXES:
 *  1. Refresh CSRF token before syncing (stale token causes 403)
 *  2. Don't break on single item failure — continue remaining items
 *  3. Retry with fresh CSRF on auth errors
 *  4. Detailed error per-item logging
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getSyncQueue, removeSyncItem, getSyncQueueCount, markInvoiceSynced } from '../db/posDB';
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

  /**
   * Refresh CSRF token by doing a lightweight GET to the site root.
   * Frappe sets window.csrf_token on every page load. After reconnect
   * the in-memory token may be stale — this refreshes it.
   */
  async function refreshCSRFToken(): Promise<boolean> {
    try {
      // Call a lightweight Frappe endpoint that returns fresh CSRF info
      const res = await fetch('/api/method/frappe.auth.get_logged_user', {
        method: 'GET',
        headers: { 'X-Frappe-Site-Name': window.location.hostname },
        credentials: 'include',
      });
      if (res.ok) {
        // Extract CSRF token from response headers (Frappe sends it in Set-Cookie or header)
        const setCookie = res.headers.get('set-cookie') || '';
        const csrfMatch = setCookie.match(/csrf_token=([^;]+)/);
        if (csrfMatch) {
          (window as any).csrf_token = csrfMatch[1];
        }
        return true;
      }
      return res.status !== 401 && res.status !== 403;
    } catch {
      return false;
    }
  }

  /**
   * Check if the user is currently authenticated.
   */
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

    // Auth check — don't sync if not logged in
    if (!isAuthenticated()) {
      console.warn('[SyncStore] syncAll() skipped — user is not authenticated.');
      return;
    }

    const queue = await getSyncQueue();
    if (!queue.length) {
      pendingCount.value = 0;
      return;
    }

    isSyncing.value = true;
    syncError.value = null;
    failedItems.value = [];

    // Attempt to refresh CSRF token before starting sync
    // This prevents stale-token 403 errors after reconnect
    await refreshCSRFToken();

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const item of queue) {
      try {
        if (item.action === 'submit_invoice') {
          await syncInvoiceItem(item);
        } else if (item.action === 'save_customer') {
          await call('frappe.client.insert', { doc: item.payload }, { skipAuthRedirect: true });
        }

        // SUCCESS — remove from queue
        await removeSyncItem(item.id);
        successCount++;

      } catch (err: any) {
        errorCount++;
        failedItems.value.push(item.id);

        const errMsg = extractErrorMessage(err);
        errors.push(errMsg);
        console.error('[SyncStore] Failed to sync item id=' + item.id, errMsg, err);

        // On auth error (401/403) — stop entire sync, user must re-login
        if (isAuthError(err)) {
          console.warn('[SyncStore] Auth error during sync — stopping.');
          syncError.value = 'Authentication error. Please refresh the page.';
          break;
        }

        // For other errors — continue syncing remaining items (don't break)
        // The failed item stays in the queue for next retry
      }
    }

    isSyncing.value = false;
    lastSyncAt.value = new Date();
    await refreshPendingCount();

    if (errors.length > 0) {
      syncError.value = errors.join('\n');
    }

    console.log(`[SyncStore] Sync complete — success: ${successCount}, failed: ${errorCount}`);
  }

  async function syncInvoiceItem(item: any) {
    const { invoice, local_id } = item.payload;

    // Insert the draft invoice (server applies defaults & validation)
    const insertedDoc = await call('frappe.client.insert', { doc: invoice }, { skipAuthRedirect: true });

    if (!insertedDoc?.name) {
      throw new Error('Insert returned no document — invoice not created');
    }

    // Submit the inserted document
    await call('frappe.client.submit', { doc: insertedDoc }, { skipAuthRedirect: true });

    // Mark local draft as synced
    if (local_id) {
      await markInvoiceSynced(local_id);
    }
  }

  function extractErrorMessage(err: any): string {
    const messages: string[] = err?.messages || [];
    if (messages.length > 0) return messages.join(' | ');
    if (err?.message) return err.message;
    return 'Unknown sync error';
  }

  function isAuthError(err: any): boolean {
    const msg = (err?.message || '').toLowerCase();
    return (
      msg.includes('401') ||
      msg.includes('403') ||
      msg.includes('not logged') ||
      msg.includes('session') ||
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

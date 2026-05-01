/**
 * syncStore.ts — Sync queue management (Pinia)
 * Processes pending invoices when back online.
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

  async function refreshPendingCount() {
    pendingCount.value = await getSyncQueueCount();
  }

  async function addToQueue(action: string, payload: any) {
    const { addToSyncQueue } = await import('../db/posDB');
    await addToSyncQueue(action, payload);
    await refreshPendingCount();
  }

  async function syncAll() {
    if (isSyncing.value) return;

    // Safety: don't sync if user is not authenticated — avoids 401 errors
    const cookies = Object.fromEntries(
      document.cookie.split('; ').filter(Boolean).map((part) => {
        const [k, ...v] = part.split('=');
        return [k, decodeURIComponent(v.join('='))];
      })
    );
    const isLoggedIn = !!cookies.user_id && cookies.user_id !== 'Guest';
    if (!isLoggedIn) {
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

    for (const item of queue) {
      try {
        if (item.action === 'submit_invoice') {
          // Insert the invoice (applies server-side defaults)
          const insertedDoc = await call('frappe.client.insert', {
            doc: item.payload.invoice,
          });
          // Submit it
          await call('frappe.client.submit', {
            doc: insertedDoc,
          });
          // Mark draft invoice as synced
          if (item.payload.local_id) {
            await markInvoiceSynced(item.payload.local_id);
          }
        } else if (item.action === 'save_customer') {
          await call('frappe.client.insert', { doc: item.payload });
        }
        // Remove from queue after success
        await removeSyncItem(item.id);
      } catch (err: any) {
        const messages: string[] = err?.messages || [];
        syncError.value = messages.length > 0
          ? messages.join('\n')
          : err?.message || 'Sync failed';
        console.error('[SyncStore] Error syncing item:', item, syncError.value);
        // Do not remove — will retry next time
        break;
      }
    }

    isSyncing.value = false;
    lastSyncAt.value = new Date();
    await refreshPendingCount();
  }

  return {
    pendingCount,
    isSyncing,
    lastSyncAt,
    syncError,
    addToQueue,
    syncAll,
    refreshPendingCount,
  };
});

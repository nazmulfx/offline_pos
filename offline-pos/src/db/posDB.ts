/**
 * posDB.ts — Raw IndexedDB wrapper for Offline POS
 * No external libraries — pure IndexedDB API
 */

const DB_NAME = 'offline_pos_db';
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

// ─── Open / Init ────────────────────────────────────────────────────────────

export function openPOSDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Items store
      if (!db.objectStoreNames.contains('items')) {
        const itemStore = db.createObjectStore('items', { keyPath: 'item_code' });
        itemStore.createIndex('item_group', 'item_group', { unique: false });
        itemStore.createIndex('item_name', 'item_name', { unique: false });
      }

      // Customers store
      if (!db.objectStoreNames.contains('customers')) {
        const custStore = db.createObjectStore('customers', { keyPath: 'name' });
        custStore.createIndex('customer_name', 'customer_name', { unique: false });
        custStore.createIndex('mobile_no', 'mobile_no', { unique: false });
      }

      // POS Profile store
      if (!db.objectStoreNames.contains('pos_profile')) {
        db.createObjectStore('pos_profile', { keyPath: 'name' });
      }

      // Batches store
      if (!db.objectStoreNames.contains('batches')) {
        const batchStore = db.createObjectStore('batches', { keyPath: 'batch_id' });
        batchStore.createIndex('item_code', 'item_code', { unique: false });
      }

      // Draft Invoices store
      if (!db.objectStoreNames.contains('draft_invoices')) {
        const draftStore = db.createObjectStore('draft_invoices', {
          keyPath: 'local_id',
          autoIncrement: true,
        });
        draftStore.createIndex('synced', 'synced', { unique: false });
      }

      // Sync Queue store
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
    };

    request.onsuccess = (event) => {
      _db = (event.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

// ─── Generic helpers ────────────────────────────────────────────────────────

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openPOSDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function withStoreAll<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, resolve: (v: T) => void, reject: (e: any) => void) => void
): Promise<T> {
  return openPOSDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        fn(store, resolve, reject);
      })
  );
}

// ─── Items ──────────────────────────────────────────────────────────────────

export async function cacheItems(items: any[]): Promise<void> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readwrite');
    const store = tx.objectStore('items');
    items.forEach((item) => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedItems(
  search: string = '',
  group: string = ''
): Promise<any[]> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readonly');
    const store = tx.objectStore('items');
    const req = store.getAll();
    req.onsuccess = () => {
      let results: any[] = req.result;
      const searchLower = search.toLowerCase();
      if (search) {
        results = results.filter(
          (i) =>
            i.item_name?.toLowerCase().includes(searchLower) ||
            i.item_code?.toLowerCase().includes(searchLower) ||
            i.barcode?.toLowerCase().includes(searchLower)
        );
      }
      if (group && group !== 'All') {
        results = results.filter((i) => i.item_group === group);
      }
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAllItemGroups(): Promise<string[]> {
  const items = await getCachedItems();
  const groups = new Set<string>(items.map((i) => i.item_group).filter(Boolean));
  return ['All', ...Array.from(groups).sort()];
}

export async function clearItems(): Promise<void> {
  return withStore<undefined>('items', 'readwrite', (store) => store.clear() as IDBRequest<undefined>);
}

// ─── Customers ──────────────────────────────────────────────────────────────

export async function cacheCustomers(customers: any[]): Promise<void> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customers', 'readwrite');
    const store = tx.objectStore('customers');
    customers.forEach((c) => store.put(c));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedCustomers(search: string = ''): Promise<any[]> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customers', 'readonly');
    const store = tx.objectStore('customers');
    const req = store.getAll();
    req.onsuccess = () => {
      let results: any[] = req.result;
      if (search) {
        const s = search.toLowerCase();
        results = results.filter(
          (c) =>
            c.customer_name?.toLowerCase().includes(s) ||
            c.name?.toLowerCase().includes(s) ||
            c.mobile_no?.toLowerCase().includes(s)
        );
      }
      resolve(results.slice(0, 50));
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── POS Profile ────────────────────────────────────────────────────────────

export async function cachePOSProfile(profile: any): Promise<void> {
  return withStore<IDBValidKey>('pos_profile', 'readwrite', (store) =>
    store.put(profile)
  ).then(() => undefined);
}

export async function getCachedPOSProfile(name: string): Promise<any | null> {
  return withStore<any>('pos_profile', 'readonly', (store) => store.get(name));
}

// ─── Draft Invoices ─────────────────────────────────────────────────────────

export async function saveDraftInvoice(invoice: any): Promise<number> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('draft_invoices', 'readwrite');
    const store = tx.objectStore('draft_invoices');
    const data = { ...invoice, synced: false, created_at: new Date().toISOString() };
    const req = store.add(data);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function markInvoiceSynced(localId: number): Promise<void> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('draft_invoices', 'readwrite');
    const store = tx.objectStore('draft_invoices');
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const invoice = getReq.result;
      if (invoice) {
        invoice.synced = true;
        store.put(invoice);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function getDraftInvoices(syncedOnly: boolean = false): Promise<any[]> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('draft_invoices', 'readonly');
    const store = tx.objectStore('draft_invoices');
    const req = store.getAll();
    req.onsuccess = () => {
      let results: any[] = req.result;
      if (!syncedOnly) results = results.filter((i) => !i.synced);
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── Sync Queue ─────────────────────────────────────────────────────────────

export async function addToSyncQueue(action: string, payload: any): Promise<number> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    const req = store.add({ action, payload, created_at: new Date().toISOString() });
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function getSyncQueue(): Promise<any[]> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readonly');
    const store = tx.objectStore('sync_queue');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeSyncItem(id: number): Promise<void> {
  return withStore<undefined>('sync_queue', 'readwrite', (store) =>
    store.delete(id) as IDBRequest<undefined>
  );
}

export async function getSyncQueueCount(): Promise<number> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readonly');
    const store = tx.objectStore('sync_queue');
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * After an offline customer syncs and gets a real ERPNext name,
 * update any queued 'submit_invoice' items that reference the temp name.
 */
export async function updateCustomerNameInQueue(
  tempName: string,
  realName: string
): Promise<void> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    const req = store.getAll();
    req.onsuccess = () => {
      const items: any[] = req.result;
      let updated = 0;
      for (const item of items) {
        if (
          item.action === 'submit_invoice' &&
          item.payload?.invoice?.customer === tempName
        ) {
          item.payload.invoice.customer = realName;
          store.put(item);
          updated++;
        }
      }
      if (updated > 0) {
        console.log(`[posDB] Updated ${updated} queued invoice(s): ${tempName} → ${realName}`);
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
  });
}

/**
 * Remove an offline customer (temp name) from the cache after sync.
 * The real customer will be fetched on next load.
 */
export async function removeOfflineCustomer(tempName: string): Promise<void> {
  return withStore<undefined>('customers', 'readwrite', (store) =>
    store.delete(tempName) as IDBRequest<undefined>
  );
}

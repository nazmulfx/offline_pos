/**
 * posDB.ts — Raw IndexedDB wrapper for Offline POS
 * No external libraries — pure IndexedDB API
 */

const DB_NAME = 'offline_pos_db';
const DB_VERSION = 5;

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

      // Serial & Batch data store
      if (!db.objectStoreNames.contains('serial_batch_data')) {
        db.createObjectStore('serial_batch_data', { keyPath: 'item_code' });
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

      // Party Balance store
      if (!db.objectStoreNames.contains('party_balance')) {
        db.createObjectStore('party_balance', { keyPath: 'id' });
      }

      // Held Invoices store
      if (!db.objectStoreNames.contains('hold_invoices')) {
        db.createObjectStore('hold_invoices', {
          keyPath: 'local_id',
          autoIncrement: true,
        });
      }

      // Print Formats store
      if (!db.objectStoreNames.contains('print_formats')) {
        db.createObjectStore('print_formats', { keyPath: 'name' });
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
    const tx = db.transaction(['items', 'serial_batch_data'], 'readonly');
    const store = tx.objectStore('items');
    const sbStore = tx.objectStore('serial_batch_data');

    const sbReq = sbStore.getAll();
    sbReq.onsuccess = () => {
      const sbResults = sbReq.result || [];
      const matchedItemCodesFromSB = new Set<string>();
      if (search) {
        const searchLower = search.toLowerCase();
        sbResults.forEach((row) => {
          const matchSerial = row.serials?.some((s: any) => s.serial_no?.toLowerCase().includes(searchLower));
          const matchBatch = row.batches?.some((b: any) => b.batch_no?.toLowerCase().includes(searchLower));
          if (matchSerial || matchBatch) {
            matchedItemCodesFromSB.add(row.item_code);
          }
        });
      }

      const req = store.getAll();
      req.onsuccess = () => {
        let results: any[] = req.result;
        const searchLower = search.toLowerCase();
        if (search) {
          results = results.filter(
            (i) =>
              i.item_name?.toLowerCase().includes(searchLower) ||
              i.item_code?.toLowerCase().includes(searchLower) ||
              i.barcode?.toLowerCase().includes(searchLower) ||
              matchedItemCodesFromSB.has(i.item_code)
          );
        }
        if (group && group !== 'All') {
          results = results.filter((i) => i.item_group === group);
        }
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    };
    sbReq.onerror = () => reject(sbReq.error);
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
      // DO NOT resolve here — store.put() is not committed until tx.oncomplete
    };
    req.onerror = () => reject(req.error);
    tx.onerror  = () => reject(tx.error);
    // Only resolve once the transaction is fully committed to disk
    tx.oncomplete = () => resolve();
  });
}

export async function updateSyncItemInvoiceName(id: number, serverInvoiceName: string): Promise<void> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (item && item.payload && item.payload.invoice) {
        item.payload.invoice.name = serverInvoiceName;
        store.put(item);
      }
    };
    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
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

// ─── Serial & Batch Data ───────────────────────────────────────────────────

export async function cacheSerialBatchData(dataMap: Record<string, any>): Promise<void> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('serial_batch_data', 'readwrite');
    const store = tx.objectStore('serial_batch_data');
    Object.entries(dataMap).forEach(([itemCode, itemData]) => {
      store.put({ item_code: itemCode, ...itemData });
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSerialBatchData(itemCode: string): Promise<any | null> {
  return withStore<any>('serial_batch_data', 'readonly', (store) => store.get(itemCode));
}

export async function getAllSerialBatchData(): Promise<any[]> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('serial_batch_data', 'readonly');
    const store = tx.objectStore('serial_batch_data');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ─── Party Balance ──────────────────────────────────────────────────────────

export interface PartyBalanceRecord {
  id: string; // `${company}-${partyType}-${party}`
  company: string;
  party_type: string;
  party: string;
  party_current_balance: number;
}

export async function cachePartyBalance(record: PartyBalanceRecord): Promise<void> {
  return withStore<IDBValidKey>('party_balance', 'readwrite', (store) =>
    store.put(record)
  ).then(() => undefined);
}

export async function getCachedPartyBalance(
  company: string,
  partyType: string,
  party: string
): Promise<PartyBalanceRecord | null> {
  const id = `${company}-${partyType}-${party}`;
  return withStore<any>('party_balance', 'readonly', (store) => store.get(id))
    .then((res) => res || null)
    .catch(() => null);
}

// ─── Held Invoices ──────────────────────────────────────────────────────────

export async function saveHoldInvoice(holdData: any): Promise<number> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('hold_invoices', 'readwrite');
    const store = tx.objectStore('hold_invoices');
    const req = store.add(holdData);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function updateHoldInvoice(localId: number, holdData: any): Promise<void> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('hold_invoices', 'readwrite');
    const store = tx.objectStore('hold_invoices');
    const req = store.put({ ...holdData, local_id: localId });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getHoldInvoices(): Promise<any[]> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('hold_invoices', 'readonly');
    const store = tx.objectStore('hold_invoices');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteHoldInvoice(localId: number): Promise<void> {
  const db = await openPOSDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('hold_invoices', 'readwrite');
    const store = tx.objectStore('hold_invoices');
    const req = store.delete(localId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Print Formats ──────────────────────────────────────────────────────────

export async function cachePrintFormat(name: string, data: any): Promise<void> {
  return withStore<IDBValidKey>('print_formats', 'readwrite', (store) =>
    store.put({ name, ...data })
  ).then(() => undefined);
}

export async function getCachedPrintFormat(name: string): Promise<any | null> {
  return withStore<any>('print_formats', 'readonly', (store) => store.get(name))
    .then((res) => res || null)
    .catch(() => null);
}


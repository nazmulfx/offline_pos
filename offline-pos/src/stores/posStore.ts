/**
 * posStore.ts — Main POS state management (Pinia)
 * Manages: session, cart, items, customers, item groups
 */
import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useNetworkStore } from './networkStore';
import { fetchItems, fetchItemByBarcode } from '../services/itemService';
import { fetchCustomers } from '../services/customerService';
import { getAllItemGroups, openPOSDB, cacheSerialBatchData, getAllSerialBatchData, getCachedCustomers, cacheCustomers, cachePartyBalance, getCachedPartyBalance, saveHoldInvoice, updateHoldInvoice, getHoldInvoices, deleteHoldInvoice, cachePOSSettings, getCachedPOSSettings } from '../db/posDB';
import call from '../lib/call';

export interface POSItem {
  item_code: string;
  item_name: string;
  price_list_rate: number;
  actual_qty: number;
  item_group: string;
  item_image: string;
  uom: string;
  stock_uom: string;
  currency: string;
  batch_no?: string;
  barcode?: string;
  is_stock_item?: number;
  item_tax_template?: string;
  item_tax_rate?: string;
  has_batch_no?: number;
  has_serial_no?: number;
}

export interface POSAlertConfig {
  title: string;
  message: string;
  type?: 'success' | 'warning' | 'info' | 'error';
  onSaveToQueue?: () => Promise<void> | void;
  saveToQueueText?: string;
}

export interface DuplicateCartItemRow {
  idx: number;
  item_code: string;
  item_name: string;
  uom: string;
  qty: number;
}

export interface DuplicateItemAlertConfig {
  item: POSItem;
  rows: DuplicateCartItemRow[];
}

export interface CartItemAllocation {
  batch_no: string;
  serial_no: string; // Newline-separated serials
  qty: number;
}

export interface CartItem {
  item_code: string;
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
  uom: string;
  discount_percentage: number;
  batch_no?: string;
  serial_no?: string;
  warehouse?: string;
  item_tax_template?: string;
  item_tax_rate?: string;
  conversion_factor?: number;
  price_list_rate?: number;
  original_price_list_rate?: number;
  is_stock_item?: number;
  has_batch_no?: number;
  has_serial_no?: number;
  allocations?: CartItemAllocation[];
}


export interface Customer {
  name: string;
  customer_name: string;
  mobile_no?: string;
  email_id?: string;
  customer_group?: string;
  loyalty_program?: string;
}

export interface POSSession {
  pos_opening: string;
  pos_profile: string;
  company: string;
  period_start_date: string;
  warehouse: string;
  currency: string;
  price_list: string;
  tax_category?: string;
  taxes_and_charges?: string;
  taxes_and_charges_data?: any[];
  customer_groups?: string[];
  payments?: Array<{ mode_of_payment: string; default: number; amount: number }>;
  // 'POS Invoice' or 'Sales Invoice' — from POS Settings
  invoice_type: 'POS Invoice' | 'Sales Invoice';
  apply_discount_on?: string;
  hide_images?: number;
  pos_print_format?: string;
  print_format?: string;
  standard_print_format?: string;
  print_mode?: string;
  print_receipt_on_order_complete?: number;
  open_print_dialogue_on_invoice_creation?: number;
  allow_partial_payment?: number;
  allow_rate_change?: number;
  allow_discount_change?: number;
  disable_rounded_total?: number;
  allow_due_sale_on_default_customer?: number;
  custom_default_customer?: string;
  show_duplicate_item_modal?: number;
}


export const usePOSStore = defineStore('pos', () => {
  const network = useNetworkStore();

  // ─── Session ──────────────────────────────────────────────────────────────
  const session = ref<POSSession | null>(
    localStorage.getItem('pos_session')
      ? JSON.parse(localStorage.getItem('pos_session')!)
      : null
  );
  const isSessionLoading = ref(false);

  // ─── Items ────────────────────────────────────────────────────────────────
  const items = ref<POSItem[]>([]);
  const itemGroups = ref<string[]>(['All']);
  const selectedGroup = ref<string>('All');
  const searchTerm = ref<string>('');
  const itemsLoading = ref(false);
  const itemsPage = ref(0);
  const itemsPageLength = 40;
  const hasMoreItems = ref(true);

  // ─── Customers ────────────────────────────────────────────────────────────
  const customers = ref<Customer[]>([]);
  const customerSearch = ref<string>('');
  const customersLoading = ref(false);

  // ─── Cart ─────────────────────────────────────────────────────────────────
  const cartItems = ref<CartItem[]>(
    localStorage.getItem('pos_cart_items')
      ? JSON.parse(localStorage.getItem('pos_cart_items')!)
      : []
  );
  const selectedCustomer = ref<Customer | null>(
    localStorage.getItem('pos_selected_customer')
      ? JSON.parse(localStorage.getItem('pos_selected_customer')!)
      : null
  );
  const selectedCustomerBalance = ref<number | null>(null);
  const cartDiscount = ref<number>(
    localStorage.getItem('pos_cart_discount')
      ? parseFloat(localStorage.getItem('pos_cart_discount')!)
      : 0
  );
  const additionalDiscount = ref<number>(
    localStorage.getItem('pos_additional_discount')
      ? parseFloat(localStorage.getItem('pos_additional_discount')!)
      : 0
  );
  const discountType = ref<'percent' | 'amount'>(
    (localStorage.getItem('pos_discount_type') as any) || 'percent'
  );
  const selectedItemIdx = ref<number | null>(null);
  
  // ─── Serial & Batch State ─────────────────────────────────────────────────
  const serialBatchMap = ref<Record<string, {
    has_serial_no: number;
    has_batch_no: number;
    serials: Array<{ serial_no: string; batch_no?: string }>;
    batches: Array<{ batch_no: string; qty: number; expiry_date?: string }>;
  }>>({});
  const pickStrategy = ref<string>('FIFO');

  // ─── Held Invoices State ──────────────────────────────────────────────────
  const heldInvoices = ref<any[]>([]);
  const currentDraftId = ref<number | null>(null);

  const warehouses = ref<string[]>([]);

  // ─── Designed Alert Modal ──────────────────────────────────────────────────
  const activeAlert = ref<POSAlertConfig | null>(null);

  function showAlert(
    title: string,
    message: string,
    type?: 'success' | 'warning' | 'info' | 'error' | POSAlertConfig,
    onSaveToQueue?: () => Promise<void> | void,
    saveToQueueText?: string
  ) {
    if (typeof type === 'object' && type !== null) {
      activeAlert.value = type;
    } else {
      activeAlert.value = { title, message, type: typeof type === 'string' ? type : 'error', onSaveToQueue, saveToQueueText };
    }
  }

  function closeAlert() {
    activeAlert.value = null;
  }

  // ─── Duplicate Item Modal State ───────────────────────────────────────────
  const duplicateItemAlert = ref<DuplicateItemAlertConfig | null>(null);

  function closeDuplicateItemAlert() {
    duplicateItemAlert.value = null;
  }

  function addQtyToExistingRow(idx: number) {
    const existing = cartItems.value[idx];
    if (!existing) return;

    const item = items.value.find(i => i.item_code === existing.item_code);
    let actualQty = item?.actual_qty ?? 999999;
    const meta = serialBatchMap.value[existing.item_code];
    if (meta) {
      if (meta.has_serial_no) {
        const activeSerials = meta.serials.filter(s => (s.status || 'Active') === 'Active');
        actualQty = activeSerials.length;
      } else if (meta.has_batch_no) {
        actualQty = meta.batches.reduce((sum, b) => sum + b.qty, 0);
      }
    }

    const neededQty = (existing.qty + 1) * (existing.conversion_factor || 1);
    if (existing.is_stock_item && neededQty > actualQty) {
      const factor = existing.conversion_factor || 1;
      const maxAllowed = Math.floor((actualQty / factor) * 1000) / 1000;
      showAlert("Stock Limit Exceeded", `Cannot add more. Only ${actualQty} stock available. Maximum allowed quantity is ${maxAllowed} ${existing.uom}.`);
      return;
    }

    existing.qty += 1;
    existing.amount = existing.qty * existing.rate;
    handleCartItemQtyChange(existing, idx);
    selectCartItem(idx);
    duplicateItemAlert.value = null;
  }

  async function forceAddToCart(item: POSItem) {
    duplicateItemAlert.value = null;
    const baseUom = item.uom || item.stock_uom || 'Nos';
    const existingBaseIdx = cartItems.value.findIndex(
      (ci) => ci.item_code === item.item_code && ci.uom === baseUom
    );

    if (existingBaseIdx !== -1) {
      addQtyToExistingRow(existingBaseIdx);
    } else {
      await addToCart(item, true);
    }
  }

  // ─── Toast Notifications ──────────────────────────────────────────────────
  const toast = ref<{ title: string; message: string; type?: 'success' | 'warning' | 'info' | 'error' } | null>(null);

  function showToast(title: string, message: string, type: 'success' | 'warning' | 'info' | 'error' = 'success') {
    toast.value = { title, message, type };
    setTimeout(() => {
      if (toast.value?.title === title) {
        toast.value = null;
      }
    }, 5500);
  }

  async function saveFailedOnlineInvoiceToSyncQueue(doc: any, errorText: string): Promise<boolean> {
    try {
      const { saveDraftInvoice, addToSyncQueue, updateSyncItemError, getSyncQueue } = await import('../db/posDB');
      const { useSyncStore } = await import('./syncStore');

      const localId = await saveDraftInvoice(doc);
      await addToSyncQueue('submit_invoice', { invoice: doc, local_id: localId });

      const queue = await getSyncQueue();
      const lastItem = queue.find((q: any) => q.payload?.local_id === localId || (doc.name && q.payload?.invoice?.name === doc.name));
      if (lastItem) {
        await updateSyncItemError(lastItem.id, errorText);
      }

      const syncStore = useSyncStore();
      await syncStore.refreshPendingCount();

      clearCart();
      if (currentDraftId.value !== null) {
        await discardHeldInvoice(currentDraftId.value);
      }

      showToast(
        'Saved to Sync Queue',
        `Invoice ${doc.name || 'Draft'} saved to Sync Queue. Update details there and submit again.`,
        'success'
      );

      return true;
    } catch (err) {
      console.error('[posStore] Failed to save online error invoice to sync queue:', err);
      return false;
    }
  }

  // Watchers to persist state
  watch(session, (newVal) => {
    if (newVal) {
      localStorage.setItem('pos_session', JSON.stringify(newVal));
    } else {
      localStorage.removeItem('pos_session');
    }
  }, { deep: true });

  watch(cartItems, (newVal) => {
    localStorage.setItem('pos_cart_items', JSON.stringify(newVal));
  }, { deep: true });

  watch(selectedCustomer, (newVal) => {
    if (newVal) {
      localStorage.setItem('pos_selected_customer', JSON.stringify(newVal));
      fetchCustomerBalance(newVal.name);
    } else {
      localStorage.removeItem('pos_selected_customer');
      selectedCustomerBalance.value = null;
    }
  });

  async function fetchCustomerBalance(customerName: string) {
    if (!session.value || !customerName) return;
    const company = session.value.company;
    const partyType = 'Customer';

    if (network.isOnline) {
      try {
        console.log(`[POSStore] Fetching Party Balance (company: "${company}", party: "${customerName}") from server...`);
        const result = await call('frappe.client.get_list', {
          doctype: 'Party Balance',
          filters: { company, party: customerName, party_type: partyType },
          fields: ['party_current_balance'],
          limit_page_length: 1,
        });
        const balance = (result && result.length > 0) ? (parseFloat(result[0].party_current_balance) || 0) : 0;
        
        // Cache in IndexedDB and localStorage
        await cachePartyBalance({
          id: `${company}-${partyType}-${customerName}`,
          company,
          party_type: partyType,
          party: customerName,
          party_current_balance: balance,
        });
        localStorage.setItem(`cached_balance_${company}_${customerName}`, balance.toString());

        if (selectedCustomer.value?.name === customerName) {
          selectedCustomerBalance.value = balance;
        }
      } catch (err) {
        console.warn('[POSStore] Failed to fetch customer balance from server, falling back to IndexedDB/localStorage:', err);
        await loadCustomerBalanceFromOffline(company, partyType, customerName);
      }
    } else {
      await loadCustomerBalanceFromOffline(company, partyType, customerName);
    }
  }

  async function loadCustomerBalanceFromOffline(company: string, partyType: string, customerName: string) {
    try {
      const cached = await getCachedPartyBalance(company, partyType, customerName);
      let balance = cached ? cached.party_current_balance : null;
      if (balance === null) {
        const localBal = localStorage.getItem(`cached_balance_${company}_${customerName}`);
        balance = localBal ? parseFloat(localBal) : 0;
      }
      if (selectedCustomer.value?.name === customerName) {
        selectedCustomerBalance.value = balance;
      }
    } catch (err) {
      console.error('[POSStore] Failed to load cached customer balance:', err);
      const localBal = localStorage.getItem(`cached_balance_${company}_${customerName}`);
      const balance = localBal ? parseFloat(localBal) : 0;
      if (selectedCustomer.value?.name === customerName) {
        selectedCustomerBalance.value = balance;
      }
    }
  }

  async function updateOfflineCustomerBalance(customerName: string, delta: number) {
    if (!session.value || !customerName) return;
    const company = session.value.company;
    const partyType = 'Customer';
    try {
      const cached = await getCachedPartyBalance(company, partyType, customerName);
      let oldBalance = cached ? cached.party_current_balance : null;
      if (oldBalance === null) {
        const localBal = localStorage.getItem(`cached_balance_${company}_${customerName}`);
        oldBalance = localBal ? parseFloat(localBal) : 0;
      }
      const newBalance = oldBalance + delta;
      
      await cachePartyBalance({
        id: `${company}-${partyType}-${customerName}`,
        company,
        party_type: partyType,
        party: customerName,
        party_current_balance: newBalance,
      });
      localStorage.setItem(`cached_balance_${company}_${customerName}`, newBalance.toString());

      if (selectedCustomer.value?.name === customerName) {
        selectedCustomerBalance.value = newBalance;
      }
      console.log(`[POSStore] Updated offline customer balance for ${customerName}: ${oldBalance} -> ${newBalance}`);
    } catch (err) {
      console.error('[POSStore] Failed to update offline customer balance:', err);
    }
  }

  watch(cartDiscount, (newVal) => {
    localStorage.setItem('pos_cart_discount', newVal.toString());
  });

  watch(additionalDiscount, (newVal) => {
    localStorage.setItem('pos_additional_discount', newVal.toString());
  });

  watch(discountType, (newVal) => {
    localStorage.setItem('pos_discount_type', newVal);
  });

  const selectedCartItem = computed(() => {
    if (selectedItemIdx.value === null) return null;
    return cartItems.value[selectedItemIdx.value] || null;
  });

  // ─── Item Groups ─────────────────────────────────────────────────────────

  async function loadItemGroups() {
    itemGroups.value = await getAllItemGroups();
  }

  // ─── Items ────────────────────────────────────────────────────────────────

  async function loadItems(reset: boolean = false) {
    if (!session.value) return;
    if (reset) {
      itemsPage.value = 0;
      hasMoreItems.value = true;
      items.value = [];
    }
    if (!hasMoreItems.value) return;

    itemsLoading.value = true;
    try {
      const result = await fetchItems({
        search: searchTerm.value,
        group: selectedGroup.value === 'All' ? '' : selectedGroup.value,
        priceList: session.value.price_list,
        posProfile: session.value.pos_profile,
        start: itemsPage.value * itemsPageLength,
        pageLength: itemsPageLength,
        isOnline: network.isOnline,
      });

      if (network.isOnline && result.length > 0) {
        try {
          const itemCodes = result.map((i: any) => i.item_code);
          const priceList = session.value.price_list;

          console.log(`[POSStore] Fetching Price List ("${priceList}") details and UOM conversion details for ${result.length} items from server...`);
          const [uomDetails, priceDetails] = await Promise.all([
            call('frappe.client.get_list', {
              doctype: 'UOM Conversion Detail',
              parent: 'Item',
              filters: { parent: ['in', itemCodes] },
              fields: ['parent', 'uom', 'conversion_factor'],
              limit_page_length: 5000,
            }),
            call('frappe.client.get_list', {
              doctype: 'Item Price',
              filters: {
                item_code: ['in', itemCodes],
                price_list: priceList,
              },
              fields: ['item_code', 'uom', 'price_list_rate'],
              limit_page_length: 5000,
            })
          ]);

          const uomList = uomDetails || [];
          const priceListRecords = priceDetails || [];

          const db = await openPOSDB();
          const tx = db.transaction('items', 'readwrite');
          const store = tx.objectStore('items');

          result
            .filter((item: any) => !item.disabled || item.disabled === 0)
            .forEach((item: any) => {
              const uoms = uomList
                .filter((ud: any) => ud.parent === item.item_code)
                .map((ud: any) => ({
                  uom: ud.uom,
                  conversion_factor: ud.conversion_factor,
                }));
              
              if (item.uom && !uoms.some((u: any) => u.uom === item.uom)) {
                uoms.push({ uom: item.uom, conversion_factor: 1 });
              }
              if (item.stock_uom && !uoms.some((u: any) => u.uom === item.stock_uom)) {
                uoms.push({ uom: item.stock_uom, conversion_factor: 1 });
              }
              item.uoms = uoms;

              const pricesMap: Record<string, number> = {};
              if (item.price_list_rate !== undefined) {
                pricesMap[item.uom || item.stock_uom] = item.price_list_rate;
              }
              priceListRecords
                .filter((pd: any) => pd.item_code === item.item_code)
                .forEach((pd: any) => {
                  if (pd.uom && pd.price_list_rate !== undefined) {
                    pricesMap[pd.uom] = pd.price_list_rate;
                  }
                });
              item.prices = pricesMap;
              item.price_list_name = priceList;

              store.put(item);
            });

          await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        } catch (enrichErr) {
          console.warn('[POSStore] Batch enrichment of UOM/Prices failed:', enrichErr);
        }
      }

      if (reset) {
        items.value = result;
      } else {
        items.value.push(...result);
      }

      if (result.length < itemsPageLength) hasMoreItems.value = false;
      itemsPage.value++;
      await loadItemGroups();
    } catch (err) {
      console.error('[POSStore] loadItems error:', err);
    } finally {
      itemsLoading.value = false;
    }
  }

  async function searchItems(term: string) {
    searchTerm.value = term;
    await loadItems(true);
  }

  async function filterByGroup(group: string) {
    selectedGroup.value = group;
    await loadItems(true);
  }

  // ─── Customers ────────────────────────────────────────────────────────────

  async function loadCustomers(search: string = '') {
    customerSearch.value = search;
    customersLoading.value = true;
    try {
      customers.value = await fetchCustomers({
        search,
        isOnline: network.isOnline,
        customerGroups: session.value?.customer_groups,
      });
    } catch (err) {
      console.error('[POSStore] loadCustomers error:', err);
    } finally {
      customersLoading.value = false;
    }
  }

  function selectCustomer(customer: Customer) {
    selectedCustomer.value = customer;
  }

  async function setDefaultCustomer(customerName: string) {
    if (!customerName) return;
    try {
      let customerObj = customers.value.find(c => c.name === customerName);
      
      if (!customerObj) {
        const cached = await getCachedCustomers(customerName);
        customerObj = cached.find(c => c.name === customerName);
      }
      
      if (!customerObj && network.isOnline) {
        console.log(`[POSStore] Fetching Customer "${customerName}" from server...`);
        const result = await call('frappe.client.get', {
          doctype: 'Customer',
          name: customerName,
        });
        if (result) {
          customerObj = {
            name: result.name,
            customer_name: result.customer_name,
            mobile_no: result.mobile_no || '',
            email_id: result.email_id || '',
            customer_group: result.customer_group || '',
            loyalty_program: result.loyalty_program || '',
          };
          await cacheCustomers([customerObj]);
        }
      }
      
      if (customerObj) {
        selectedCustomer.value = customerObj;
      }
    } catch (err) {
      console.warn('[POSStore] setDefaultCustomer failed:', err);
    }
  }

  // ─── Serial & Batch Selection Helpers ─────────────────────────────────────
  function getAvailableStockPool(itemCode: string, excludeIdx: number | null = null) {
    const meta = serialBatchMap.value[itemCode];
    if (!meta) return { serials: [], batches: [] };

    let serials = meta.serials.filter(s => (s.status || 'Active') === 'Active');
    let batches = meta.batches.map(b => ({ ...b }));

    cartItems.value.forEach((ci, idx) => {
      if (ci.item_code !== itemCode) return;
      if (excludeIdx !== null && idx === excludeIdx) return;

      if (ci.serial_no) {
        const allocatedSerials = ci.serial_no.split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
        serials = serials.filter(s => !allocatedSerials.includes(s.serial_no.toLowerCase()));
      }

      if (ci.batch_no) {
        const allocatedQty = ci.qty * (ci.conversion_factor || 1);
        const batch = batches.find(b => b.batch_no === ci.batch_no);
        if (batch) {
          batch.qty = Math.max(0, batch.qty - allocatedQty);
        }
      }
    });

    return { serials, batches };
  }

  function sortBatches(batches: any[]) {
    const strategy = pickStrategy.value || 'FIFO';
    const list = [...batches];
    if (strategy === 'Expiry') {
      list.sort((a, b) => {
        const dateA = a.expiry_date || '9999-12-31';
        const dateB = b.expiry_date || '9999-12-31';
        return dateA.localeCompare(dateB);
      });
    } else if (strategy === 'LIFO') {
      list.reverse();
    }
    return list;
  }

  function autoSelectSerialsAndBatches(
    itemCode: string, 
    requiredQty: number, 
    excludeIdx: number | null = null, 
    targetBatchNo: string = '',
    conversionFactor: number = 1
  ): CartItemAllocation[] {
    const meta = serialBatchMap.value[itemCode];
    if (!meta) {
      return [];
    }

    const pool = getAvailableStockPool(itemCode, excludeIdx);
    const allocations: CartItemAllocation[] = [];
    let remainingQty = requiredQty;

    if (meta.has_batch_no && meta.has_serial_no) {
      const sortedBatches = sortBatches(pool.batches);
      for (const b of sortedBatches) {
        if (targetBatchNo && b.batch_no !== targetBatchNo) continue;
        if (remainingQty <= 0) break;
        const allocQty = Math.min(remainingQty, b.qty);
        if (allocQty > 0) {
          allocations.push({
            batch_no: b.batch_no,
            serial_no: '',
            qty: allocQty
          });
          remainingQty -= allocQty;
        }
      }
      if (remainingQty > 0 && sortedBatches.length > 0) {
        const fallbackBatch = targetBatchNo || sortedBatches[0].batch_no;
        if (allocations.length > 0) {
          allocations[0].qty += remainingQty;
        } else {
          allocations.push({
            batch_no: fallbackBatch,
            serial_no: '',
            qty: remainingQty
          });
        }
        remainingQty = 0;
      }
    } else if (meta.has_batch_no) {
      const sortedBatches = sortBatches(pool.batches);

      if (conversionFactor > 1) {
        // First check if any single batch has enough available stock in whole UOM units to fulfill the ENTIRE requiredQty
        const singleFullBatch = sortedBatches.find(b => {
          if (targetBatchNo && b.batch_no !== targetBatchNo) return false;
          const fullUomQtyInStock = Math.floor(b.qty / conversionFactor) * conversionFactor;
          return fullUomQtyInStock >= remainingQty;
        });

        if (singleFullBatch) {
          allocations.push({
            batch_no: singleFullBatch.batch_no,
            serial_no: '',
            qty: remainingQty
          });
          remainingQty = 0;
        } else {
          // Pass 2: Allocate maximum whole UOM units per batch following sorted order (FIFO/LIFO/Expiry)
          for (const b of sortedBatches) {
            if (targetBatchNo && b.batch_no !== targetBatchNo) continue;
            if (remainingQty <= 0) break;

            const maxUomStock = Math.floor(b.qty / conversionFactor) * conversionFactor;
            if (maxUomStock <= 0) continue;

            const allocQty = Math.min(remainingQty, maxUomStock);
            if (allocQty > 0) {
              allocations.push({
                batch_no: b.batch_no,
                serial_no: '',
                qty: allocQty
              });
              remainingQty -= allocQty;
            }
          }

          // Fallback: If requiredQty is still not fully allocated, allocate remaining deficit from available batches
          if (remainingQty > 0 && sortedBatches.length > 0) {
            for (const b of sortedBatches) {
              if (targetBatchNo && b.batch_no !== targetBatchNo) continue;
              if (remainingQty <= 0) break;

              const existingAlloc = allocations.find(a => a.batch_no === b.batch_no);
              const alreadyAllocated = existingAlloc ? existingAlloc.qty : 0;
              const remainingInBatch = Math.max(0, b.qty - alreadyAllocated);
              if (remainingInBatch > 0) {
                const addQty = Math.min(remainingQty, remainingInBatch);
                if (existingAlloc) {
                  existingAlloc.qty += addQty;
                } else {
                  allocations.push({
                    batch_no: b.batch_no,
                    serial_no: '',
                    qty: addQty
                  });
                }
                remainingQty -= addQty;
              }
            }

            if (remainingQty > 0 && sortedBatches.length > 0) {
              const fallbackBatch = targetBatchNo || sortedBatches[0].batch_no;
              const existingAlloc = allocations.find(a => a.batch_no === fallbackBatch);
              if (existingAlloc) {
                existingAlloc.qty += remainingQty;
              } else {
                allocations.push({
                  batch_no: fallbackBatch,
                  serial_no: '',
                  qty: remainingQty
                });
              }
              remainingQty = 0;
            }
          }
        }
      } else {
        // Standard stock UOM allocation (conversionFactor <= 1)
        for (const b of sortedBatches) {
          if (targetBatchNo && b.batch_no !== targetBatchNo) continue;
          if (remainingQty <= 0) break;
          const allocQty = Math.min(remainingQty, b.qty);
          if (allocQty > 0) {
            allocations.push({
              batch_no: b.batch_no,
              serial_no: '',
              qty: allocQty
            });
            remainingQty -= allocQty;
          }
        }
        if (remainingQty > 0 && sortedBatches.length > 0) {
          const fallbackBatch = targetBatchNo || sortedBatches[0].batch_no;
          if (allocations.length > 0) {
            allocations[0].qty += remainingQty;
          } else {
            allocations.push({
              batch_no: fallbackBatch,
              serial_no: '',
              qty: remainingQty
            });
          }
          remainingQty = 0;
        }
      }
    } else if (meta.has_serial_no) {
      allocations.push({
        batch_no: '',
        serial_no: '',
        qty: requiredQty
      });
      remainingQty = 0;
    }

    return allocations;
  }

  function handleCartItemQtyChange(item: CartItem, idx: number) {
    const meta = serialBatchMap.value[item.item_code];
    if (!meta) return;

    if (meta.has_serial_no || meta.has_batch_no) {
      const conversionFactor = item.conversion_factor || 1;
      const requiredQty = item.qty * conversionFactor;
      const allocs = autoSelectSerialsAndBatches(item.item_code, requiredQty, idx, '', conversionFactor);
      
      item.allocations = allocs;
      item.batch_no = allocs[0]?.batch_no || '';
      item.serial_no = allocs.map(a => a.serial_no).filter(Boolean).join('\n');
    }
  }

  async function addToCart(item: POSItem, forceNew: boolean = false) {
    if (network.isOnline && (item.has_serial_no || item.has_batch_no)) {
      await refreshItemSerialBatchDataFromServer(item.item_code);
    }

    const meta = serialBatchMap.value[item.item_code];
    let actualQty = item.actual_qty;
    if (meta) {
      if (meta.has_serial_no) {
        const activeSerials = meta.serials.filter(s => (s.status || 'Active') === 'Active');
        actualQty = activeSerials.length;
      } else if (meta.has_batch_no) {
        actualQty = meta.batches.reduce((sum, b) => sum + b.qty, 0);
      }
    }

    if (item.is_stock_item && (actualQty === undefined || actualQty <= 0)) {
      showAlert("Out of Stock", "stock is available to this warehouse is zero. can't add to cart");
      return;
    }

    // Check if item already exists in cart and duplicate modal is enabled (1 = show modal, any other value = skip)
    const sessionVal = session.value?.show_duplicate_item_modal;
    const lsVal = localStorage.getItem('pos_show_duplicate_item_modal');

    const isModalEnabled = sessionVal !== undefined && sessionVal !== null
      ? (sessionVal === 1 || sessionVal === '1' || sessionVal === true)
      : (lsVal === '1' || lsVal === 'true');

    if (!forceNew) {
      const existingRows = cartItems.value
        .map((ci, idx) => ({ ci, idx }))
        .filter(({ ci }) => ci.item_code === item.item_code);

      if (existingRows.length > 0) {
        if (isModalEnabled) {
          duplicateItemAlert.value = {
            item,
            rows: existingRows.map(({ ci, idx }) => ({
              idx,
              item_code: ci.item_code,
              item_name: ci.item_name,
              uom: ci.uom,
              qty: ci.qty
            }))
          };
          return;
        } else {
          // Modal disabled (0 / skip): auto-increment existing item row
          let uom = item.uom || item.stock_uom || 'Nos';
          let existingIdx = cartItems.value.findIndex(
            (ci) => ci.item_code === item.item_code && ci.uom === uom
          );
          if (existingIdx === -1) {
            existingIdx = existingRows[0].idx;
          }
          addQtyToExistingRow(existingIdx);
          return;
        }
      }
    }

    let uom = item.uom || item.stock_uom || 'Nos';
    let rate = item.price_list_rate || 0;
    let conversionFactor = 1;

    let selectedBatchNo = '';
    let selectedSerialNo = '';
    if (meta && (meta.has_batch_no || meta.has_serial_no)) {
      const tempAlloc = autoSelectSerialsAndBatches(item.item_code, 1);
      if (tempAlloc && tempAlloc.length > 0) {
        selectedBatchNo = tempAlloc[0].batch_no || '';
        selectedSerialNo = tempAlloc[0].serial_no || '';
      }
    }

    const newCartItem: CartItem = {
      item_code: item.item_code,
      item_name: item.item_name,
      qty: 1,
      rate: rate,
      amount: rate,
      uom: uom,
      discount_percentage: 0,
      batch_no: selectedBatchNo,
      warehouse: session.value?.warehouse || '',
      item_tax_template: item.item_tax_template,
      item_tax_rate: item.item_tax_rate,
      conversion_factor: conversionFactor,
      price_list_rate: rate,
      original_price_list_rate: rate,
      is_stock_item: item.is_stock_item ? 1 : 0,
      has_batch_no: item.has_batch_no || 0,
      has_serial_no: item.has_serial_no || 0,
      allocations: []
    };

    if (selectedBatchNo || selectedSerialNo) {
      newCartItem.allocations = [{
        batch_no: selectedBatchNo,
        serial_no: selectedSerialNo,
        qty: 1
      }];
      newCartItem.serial_no = selectedSerialNo;
    }
    
    cartItems.value.push(newCartItem);
    const newIdx = cartItems.value.length - 1;
    
    handleCartItemQtyChange(newCartItem, newIdx);
    selectCartItem(newIdx);
  }

  function selectCartItem(idx: number | null) {
    selectedItemIdx.value = idx;
  }

  function removeFromCart(item_code: string, batch_no: string = '', uom: string = '') {
    const targetBatch = batch_no || '';
    const indexToRemove = cartItems.value.findIndex(
      (ci) => ci.item_code === item_code && (uom === '' || ci.uom === uom) && (ci.batch_no || '') === targetBatch
    );
    if (indexToRemove !== -1 && selectedItemIdx.value === indexToRemove) {
      selectedItemIdx.value = null;
    } else if (indexToRemove !== -1 && selectedItemIdx.value !== null && indexToRemove < selectedItemIdx.value) {
      selectedItemIdx.value -= 1;
    }
    cartItems.value = cartItems.value.filter(
      (ci, idx) => idx !== indexToRemove
    );
  }

  async function updateQty(item_code: string, qty: number, batch_no: string = '', uom: string = ''): Promise<boolean> {
    const targetBatch = batch_no || '';
    const idx = cartItems.value.findIndex(
      (ci) => ci.item_code === item_code && (uom === '' || ci.uom === uom) && (ci.batch_no || '') === targetBatch
    );
    if (idx === -1) return false;
    const item = cartItems.value[idx];
    if (qty <= 0) {
      removeFromCart(item_code, batch_no, uom);
      return true;
    }

    if (network.isOnline && (item.has_serial_no || item.has_batch_no)) {
      await refreshItemSerialBatchDataFromServer(item_code);
    }

    const meta = serialBatchMap.value[item_code];
    let actualQty = 999999;
    if (item.is_stock_item) {
      const catalogItem = items.value.find((i) => i.item_code === item_code);
      if (catalogItem?.actual_qty !== undefined) {
        actualQty = catalogItem.actual_qty;
      } else {
        const db = await openPOSDB();
        const tx = db.transaction('items', 'readonly');
        const store = tx.objectStore('items');
        const dbItem = await new Promise<any>((resolve) => {
          const req = store.get(item_code);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (dbItem?.actual_qty !== undefined) {
          actualQty = dbItem.actual_qty;
        } else {
          actualQty = 0;
        }
      }
    }
    if (meta) {
      if (meta.has_serial_no) {
        const activeSerials = meta.serials.filter(s => (s.status || 'Active') === 'Active');
        actualQty = activeSerials.length;
      } else if (meta.has_batch_no) {
        actualQty = meta.batches.reduce((sum, b) => sum + b.qty, 0);
      }
    }

    const factor = item.conversion_factor || 1;
    if (item.is_stock_item && qty * factor > actualQty) {
      const maxAllowed = Math.floor((actualQty / factor) * 1000) / 1000;
      showAlert("Stock Limit Exceeded", `Cannot set quantity to ${qty}. Only ${actualQty} stock available. Maximum allowed quantity is ${maxAllowed} ${item.uom}.`);
      return false;
    }

    item.qty = qty;
    item.amount = qty * item.rate;

    handleCartItemQtyChange(item, idx);
    return true;
  }


  function updateRate(item_code: string, rate: number, batch_no: string = '') {
    const item = selectedItemIdx.value !== null ? cartItems.value[selectedItemIdx.value] : cartItems.value.find((ci) => ci.item_code === item_code);
    if (!item) return;
    const sanitizedRate = Math.max(0, rate);
    item.rate = sanitizedRate;
    
    const priceListRate = item.price_list_rate || sanitizedRate;
    if (priceListRate > 0 && sanitizedRate < priceListRate) {
      item.discount_percentage = ((priceListRate - sanitizedRate) / priceListRate) * 100;
    } else {
      item.discount_percentage = 0;
    }
    
    item.amount = item.qty * sanitizedRate;
  }

  function updateDiscount(item_code: string, pct: number, batch_no: string = '') {
    const item = selectedItemIdx.value !== null ? cartItems.value[selectedItemIdx.value] : cartItems.value.find((ci) => ci.item_code === item_code);
    if (!item) return;
    const sanitizedPct = Math.max(0, Math.min(100, pct));
    item.discount_percentage = sanitizedPct;
    const priceListRate = item.price_list_rate || item.rate;
    item.rate = priceListRate * (1 - sanitizedPct / 100);
    item.amount = item.qty * item.rate;
  }

  function updateCartItemWarehouse(item_code: string, warehouse: string, batch_no: string = '') {
    const item = selectedItemIdx.value !== null ? cartItems.value[selectedItemIdx.value] : cartItems.value.find((ci) => ci.item_code === item_code);
    if (item) {
      item.warehouse = warehouse;
    }
  }

  function updateCartItemUOM(item_code: string, uom: string, batch_no: string = '') {
    const idx = selectedItemIdx.value !== null ? selectedItemIdx.value : cartItems.value.findIndex((ci) => ci.item_code === item_code);
    if (idx !== -1) {
      const item = cartItems.value[idx];
      item.uom = uom;
      handleCartItemQtyChange(item, idx);
    }
  }

  async function updateCartItemConversionFactor(item_code: string, factor: number, batch_no: string = ''): Promise<boolean> {
    const idx = selectedItemIdx.value !== null ? selectedItemIdx.value : cartItems.value.findIndex((ci) => ci.item_code === item_code);
    if (idx !== -1) {
      const item = cartItems.value[idx];
      if (item.is_stock_item) {
        const neededQty = item.qty * factor;
        const catalogItem = items.value.find((i) => i.item_code === item_code);
        let actualQty = catalogItem?.actual_qty !== undefined ? catalogItem.actual_qty : 0;
        
        if (catalogItem?.actual_qty === undefined) {
          const db = await openPOSDB();
          const tx = db.transaction('items', 'readonly');
          const store = tx.objectStore('items');
          const dbItem = await new Promise<any>((resolve) => {
            const req = store.get(item_code);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          });
          if (dbItem?.actual_qty !== undefined) {
            actualQty = dbItem.actual_qty;
          }
        }
        
        const meta = serialBatchMap.value[item_code];
        if (meta) {
          if (meta.has_serial_no) {
            const activeSerials = meta.serials.filter(s => (s.status || 'Active') === 'Active');
            actualQty = activeSerials.length;
          } else if (meta.has_batch_no) {
            actualQty = meta.batches.reduce((sum, b) => sum + b.qty, 0);
          }
        }

        if (neededQty > actualQty) {
          const maxAllowed = Math.floor((actualQty / factor) * 1000) / 1000;
          showAlert("Stock Limit Exceeded", `Cannot change UOM. Only ${actualQty} stock available. Maximum allowed quantity is ${maxAllowed} ${item.uom}.`);
          return false;
        }
      }
      item.conversion_factor = factor;
      handleCartItemQtyChange(item, idx);
      return true;
    }
    return false;
  }

  function updateCartItemPrice(item_code: string, priceListRate: number, batch_no: string = '') {
    const item = selectedItemIdx.value !== null ? cartItems.value[selectedItemIdx.value] : cartItems.value.find((ci) => ci.item_code === item_code);
    if (!item) return;
    item.price_list_rate = priceListRate;
    item.original_price_list_rate = priceListRate;
    const pct = item.discount_percentage || 0;
    item.rate = priceListRate * (1 - pct / 100);
    item.amount = item.qty * item.rate;
  }

  function clearCart() {
    cartItems.value = [];
    
    const defCustName = localStorage.getItem('pos_default_customer_name');
    if (defCustName) {
      setDefaultCustomer(defCustName);
    } else {
      selectedCustomer.value = null;
    }

    cartDiscount.value = 0;
    additionalDiscount.value = 0;
    selectedItemIdx.value = null;
    currentDraftId.value = null;
  }

  // ─── Computed Totals ─────────────────────────────────────────────────────

  const subtotal = computed(() =>
    cartItems.value.reduce((sum, ci) => sum + ci.qty * ci.rate, 0)
  );

  const totalDiscount = computed(() => {
    return additionalDiscount.value;
  });

  const taxes = computed(() => {
    const discountOn = session.value?.apply_discount_on || 'Grand Total';
    const discountRatio = (discountOn === 'Net Total' && subtotal.value > 0)
      ? Math.max(0, 1 - (additionalDiscount.value / subtotal.value))
      : 1;

    // If POS Profile has taxes_and_charges template set, use it for all items
    if (session.value?.taxes_and_charges && session.value?.taxes_and_charges_data?.length) {
      const netTotal = discountOn === 'Net Total'
        ? Math.max(0, subtotal.value - additionalDiscount.value)
        : subtotal.value;
      return session.value.taxes_and_charges_data.map((taxRow: any) => {
        let amt = 0;
        const rate = taxRow.rate || 0;
        if (taxRow.charge_type === 'On Net Total') {
          amt = netTotal * (rate / 100);
        } else if (taxRow.charge_type === 'Actual') {
          amt = rate;
        } else {
          amt = netTotal * (rate / 100);
        }
        return {
          account_head: taxRow.account_head,
          rate: rate,
          tax_amount: amt,
          description: taxRow.description || taxRow.account_head.split(' - ')[0],
        };
      });
    }

    const taxMap: Record<string, { account_head: string; rate: number; tax_amount: number; description: string }> = {};

    cartItems.value.forEach((ci) => {
      const itemNet = ci.qty * ci.rate * discountRatio;

      let itemTaxRate: Record<string, number> = {};
      if (ci.item_tax_rate) {
        try {
          itemTaxRate = typeof ci.item_tax_rate === 'string'
            ? JSON.parse(ci.item_tax_rate)
            : ci.item_tax_rate;
        } catch (e) {
          console.warn('Failed to parse item_tax_rate:', ci.item_tax_rate, e);
        }
      }

      Object.entries(itemTaxRate).forEach(([account, rate]) => {
        const amt = itemNet * (rate / 100);
        if (!taxMap[account]) {
          taxMap[account] = {
            account_head: account,
            rate: rate,
            tax_amount: 0,
            description: account.split(' - ')[0],
          };
        }
        taxMap[account].tax_amount += amt;
      });
    });

    return Object.values(taxMap);
  });

  const totalTaxes = computed(() =>
    taxes.value.reduce((sum, t) => sum + t.tax_amount, 0)
  );

  const discountBase = computed(() => {
    const discountOn = session.value?.apply_discount_on || 'Grand Total';
    if (discountOn === 'Net Total') {
      return subtotal.value;
    }
    return subtotal.value + totalTaxes.value;
  });

  const grandTotal = computed(() => {
    const rawTotal = subtotal.value - totalDiscount.value + totalTaxes.value;
    return Math.max(0, rawTotal);
  });

  const roundedTotal = computed(() => {
    const total = grandTotal.value;
    if (session.value?.disable_rounded_total === 1) {
      return total;
    }
    return Math.round(total);
  });

  const roundingAdjustment = computed(() => {
    if (session.value?.disable_rounded_total === 1) {
      return 0;
    }
    return parseFloat((roundedTotal.value - grandTotal.value).toFixed(2));
  });

  const cartCount = computed(() =>
    cartItems.value.reduce((sum, ci) => sum + ci.qty, 0)
  );

  function setAdditionalDiscountPercent(val: number) {
    discountType.value = 'percent';
    const sanitizedVal = Math.max(0, Math.min(100, val));
    cartDiscount.value = sanitizedVal;
    additionalDiscount.value = parseFloat((discountBase.value * (sanitizedVal / 100)).toFixed(2));
  }

  function setAdditionalDiscountAmount(val: number) {
    discountType.value = 'amount';
    const sanitizedVal = Math.max(0, Math.min(discountBase.value, val));
    additionalDiscount.value = sanitizedVal;
    cartDiscount.value = discountBase.value > 0
      ? parseFloat(((sanitizedVal / discountBase.value) * 100).toFixed(4))
      : 0;
  }

  watch([subtotal, totalTaxes], () => {
    if (discountType.value === 'percent') {
      additionalDiscount.value = parseFloat((discountBase.value * (cartDiscount.value / 100)).toFixed(2));
    } else {
      if (additionalDiscount.value > discountBase.value) {
        additionalDiscount.value = discountBase.value;
      }
      cartDiscount.value = discountBase.value > 0
        ? parseFloat(((additionalDiscount.value / discountBase.value) * 100).toFixed(4))
        : 0;
    }
  });

  // ─── Serial & Batch Loading ────────────────────────────────────────────────
  async function loadSerialBatchData() {
    try {
      const allData = await getAllSerialBatchData();
      const map: any = {};
      allData.forEach((item: any) => {
        map[item.item_code] = {
          has_serial_no: item.has_serial_no || 0,
          has_batch_no: item.has_batch_no || 0,
          serials: item.serials || [],
          batches: item.batches || [],
        };
      });
      serialBatchMap.value = map;
      const strategy = localStorage.getItem('pick_serial_and_batch_based_on') || 'FIFO';
      pickStrategy.value = strategy;
    } catch (e) {
      console.error('[POSStore] Failed to load serial & batch data from IndexedDB:', e);
    }
  }

  if (session.value) {
    loadSerialBatchData();
  }

  // ─── Session ─────────────────────────────────────────────────────────────

  async function refreshSerialBatchDataFromServer() {
    if (!network.isOnline) return;
    const warehouse = session.value?.warehouse;
    if (!warehouse) return;
    try {
      console.log(`[POSStore] Fetching Serial and Batch stock data for warehouse "${warehouse}" from server...`);
      const sbRes = await call('offline_pos.api.get_serial_batch_data', {
        warehouse: warehouse
      });
      if (sbRes && sbRes.data) {
        await cacheSerialBatchData(sbRes.data);
        localStorage.setItem('pick_serial_and_batch_based_on', sbRes.pick_serial_and_batch_based_on || 'FIFO');
      }
    } catch (err) {
      console.error('[POSStore] Failed to refresh serial and batch data from server:', err);
    } finally {
      await loadSerialBatchData();
    }
  }

  async function refreshItemSerialBatchDataFromServer(itemCode: string) {
    if (!network.isOnline) return;
    const warehouse = session.value?.warehouse;
    if (!warehouse) return;
    try {
      console.log(`[POSStore] Fetching Serial and Batch stock data for item "${itemCode}" in warehouse "${warehouse}" from server...`);
      const sbRes = await call('offline_pos.api.get_serial_batch_data', {
        warehouse: warehouse,
        item_code: itemCode
      });
      if (sbRes && sbRes.data && sbRes.data[itemCode]) {
        const itemData = sbRes.data[itemCode];
        serialBatchMap.value[itemCode] = {
          has_serial_no: itemData.has_serial_no || 0,
          has_batch_no: itemData.has_batch_no || 0,
          serials: itemData.serials || [],
          batches: itemData.batches || [],
        };
        await cacheSerialBatchData(sbRes.data);
      }
    } catch (err) {
      console.warn(`[POSStore] Failed to refresh serial/batch data for ${itemCode}:`, err);
    }
  }

  async function fetchPOSSettings(): Promise<any> {
    let posSettingsDoc: any = null;
    try {
      if (network.isOnline) {
        posSettingsDoc = await call('frappe.client.get', {
          doctype: 'POS Settings',
          name: 'POS Settings',
        });
        if (posSettingsDoc) {
          await cachePOSSettings(posSettingsDoc);
          localStorage.setItem('cached_pos_settings', JSON.stringify(posSettingsDoc));
        }
      }
    } catch (err) {
      console.warn('[POSStore] Could not fetch POS Settings from server:', err);
    }

    if (!posSettingsDoc) {
      try {
        posSettingsDoc = await getCachedPOSSettings();
      } catch (err) {
        console.warn('[POSStore] Failed to load POS Settings from IndexedDB:', err);
      }
      if (!posSettingsDoc) {
        const lsSettings = localStorage.getItem('cached_pos_settings');
        if (lsSettings) {
          try {
            posSettingsDoc = JSON.parse(lsSettings);
          } catch (_) {}
        }
      }
    }

    if (posSettingsDoc) {
      const rawDupModalSetting = posSettingsDoc.show_duplicate_item_modal;
      const showDuplicateItemModal: number = (
        rawDupModalSetting === 1 || rawDupModalSetting === '1' || rawDupModalSetting === true
      ) ? 1 : 0;

      localStorage.setItem('pos_show_duplicate_item_modal', String(showDuplicateItemModal));

      if (session.value) {
        session.value.show_duplicate_item_modal = showDuplicateItemModal;
        localStorage.setItem('pos_session', JSON.stringify(session.value));
      }
    }

    return posSettingsDoc;
  }

  async function initSession(openingEntry: any, profileData: any) {
    // Fetch POS Settings (invoice_type, custom_default_customer, allow_due_sale_on_default_customer)
    let posSettingsDoc: any = await fetchPOSSettings();

    const invoiceType: 'POS Invoice' | 'Sales Invoice' = posSettingsDoc?.invoice_type === 'Sales Invoice' ? 'Sales Invoice' : 'POS Invoice';
    const defaultCustomerName: string | null = posSettingsDoc?.custom_default_customer || localStorage.getItem('pos_default_customer_name') || null;
    const allowDueSaleOnDefaultCustomer: number = posSettingsDoc?.allow_due_sale_on_default_customer ? 1 : 0;
    const rawDupModalSetting = posSettingsDoc?.show_duplicate_item_modal;
    const showDuplicateItemModal: number = (
      rawDupModalSetting === 1 || rawDupModalSetting === '1' || rawDupModalSetting === true
    ) ? 1 : 0;

    if (defaultCustomerName) {
      localStorage.setItem('pos_default_customer_name', defaultCustomerName);
    } else {
      localStorage.removeItem('pos_default_customer_name');
    }
    localStorage.setItem('pos_allow_due_sale_on_default_customer', String(allowDueSaleOnDefaultCustomer));
    localStorage.setItem('pos_show_duplicate_item_modal', String(showDuplicateItemModal));

    let fullOpeningEntry = openingEntry;
    if (!openingEntry.balance_details) {
      try {
        console.log(`[POSStore] Fetching POS Opening Entry "${openingEntry.name}" from server...`);
        fullOpeningEntry = await call('frappe.client.get', {
          doctype: 'POS Opening Entry',
          name: openingEntry.name,
        });
      } catch (err) {
        console.error('[POSStore] Failed to fetch full opening entry:', err);
      }
    }

    const balanceDetails = fullOpeningEntry.balance_details || [];
    const payments = (profileData.payments || []).map((p: any) => {
      const openingDetail = balanceDetails.find((d: any) => d.mode_of_payment === p.mode_of_payment);
      return {
        mode_of_payment: p.mode_of_payment,
        default: p.default || 0,
        amount: p.amount || 0,
        opening_amount: openingDetail ? (openingDetail.opening_amount || 0) : 0,
      };
    });

    let taxesAndChargesData: any[] = [];
    if (profileData.taxes_and_charges) {
      try {
        console.log(`[POSStore] Fetching Sales Taxes and Charges Template "${profileData.taxes_and_charges}" from server...`);
        const templateDoc = await call('frappe.client.get', {
          doctype: 'Sales Taxes and Charges Template',
          name: profileData.taxes_and_charges,
        });
        if (templateDoc && templateDoc.taxes) {
          taxesAndChargesData = templateDoc.taxes;
        }
      } catch (err) {
        console.error('[POSStore] Failed to fetch taxes_and_charges template:', err);
      }
    }

    session.value = {
      pos_opening: openingEntry.name,
      pos_profile: openingEntry.pos_profile,
      company: openingEntry.company,
      period_start_date: openingEntry.period_start_date,
      warehouse: profileData.warehouse,
      currency: profileData.currency || 'BDT',
      price_list: profileData.selling_price_list,
      tax_category: profileData.tax_category,
      taxes_and_charges: profileData.taxes_and_charges,
      taxes_and_charges_data: taxesAndChargesData,
      customer_groups: profileData.customer_groups?.map((g: any) => g.name || g) || [],
      payments,
      invoice_type: invoiceType,
      apply_discount_on: profileData.apply_discount_on || 'Grand Total',
      hide_images: profileData.hide_images || 0,
      pos_print_format: profileData.pos_print_format || profileData.print_format || '',
      print_format: profileData.print_format || '',
      standard_print_format: profileData.standard_print_format || '',
      print_mode: profileData.print_mode || 'POS',
      print_receipt_on_order_complete: profileData.print_receipt_on_order_complete || 0,
      open_print_dialogue_on_invoice_creation: profileData.open_print_dialogue_on_invoice_creation || 0,
      allow_partial_payment: profileData.allow_partial_payment,
      allow_rate_change: profileData.allow_rate_change,
      allow_discount_change: profileData.allow_discount_change,
      disable_rounded_total: profileData.disable_rounded_total,
      allow_due_sale_on_default_customer: allowDueSaleOnDefaultCustomer,
      custom_default_customer: defaultCustomerName || undefined,
      show_duplicate_item_modal: showDuplicateItemModal,
    };

    if (!selectedCustomer.value && defaultCustomerName) {
      await setDefaultCustomer(defaultCustomerName);
    }

    // Load and cache warehouses list
    try {
      let loaded = false;
      if (network.isOnline) {
        try {
          console.log(`[POSStore] Fetching Warehouse list from server...`);
          const whList = await call('frappe.client.get_list', {
            doctype: 'Warehouse',
            fields: ['name'],
            limit_page_length: 500,
          });
          warehouses.value = (whList || []).map((w: any) => w.name);
          localStorage.setItem('pos_warehouses', JSON.stringify(warehouses.value));
          loaded = true;
        } catch (whErr) {
          console.warn('[POSStore] Failed to load warehouses online, falling back to local cache:', whErr);
        }
      }
      if (!loaded) {
        const cachedWh = localStorage.getItem('pos_warehouses');
        if (cachedWh) warehouses.value = JSON.parse(cachedWh);
      }
    } catch (e) {
      console.warn('[POSStore] Failed to load warehouses list', e);
    }
    // Ensure default warehouse is in the list
    if (profileData.warehouse && !warehouses.value.includes(profileData.warehouse)) {
      warehouses.value.push(profileData.warehouse);
    }

    // Pre-load data
    await Promise.all([loadItems(true), loadCustomers('')]);

    // Fetch and cache Serial & Batch data if online, then load into memory
    if (network.isOnline) {
      await refreshSerialBatchDataFromServer();
    } else {
      await loadSerialBatchData();
    }

    // Start background pre-fetch of all items and customers for offline completeness
    prefetchAllItems();
    prefetchAllCustomers();
  }

  async function prefetchAllItems() {
    if (!session.value || !network.isOnline) return;
    console.log('[POSStore] Starting background catalog pre-fetch...');
    
    let start = 0;
    const batchSize = 500;
    let hasMore = true;
    
    while (hasMore) {
      try {
        const result = await fetchItems({
          search: '',
          group: '',
          priceList: session.value.price_list,
          posProfile: session.value.pos_profile,
          start: start,
          pageLength: batchSize,
          isOnline: true,
        });
        
        if (result.length > 0) {
          const itemCodes = result.map((i: any) => i.item_code);
          const priceList = session.value.price_list;
          
          console.log(`[POSStore] Prefetching UOM Conversion Detail and Item Price details for "${priceList}" price list from server...`);
          const [uomDetails, priceDetails] = await Promise.all([
            call('frappe.client.get_list', {
              doctype: 'UOM Conversion Detail',
              parent: 'Item',
              filters: { parent: ['in', itemCodes] },
              fields: ['parent', 'uom', 'conversion_factor'],
              limit_page_length: 5000,
            }).catch(() => []),
            call('frappe.client.get_list', {
              doctype: 'Item Price',
              filters: {
                item_code: ['in', itemCodes],
                price_list: priceList,
              },
              fields: ['item_code', 'uom', 'price_list_rate'],
              limit_page_length: 5000,
            }).catch(() => [])
          ]);
          
          const uomList = uomDetails || [];
          const priceListRecords = priceDetails || [];
          const db = await openPOSDB();
          const tx = db.transaction('items', 'readwrite');
          const store = tx.objectStore('items');
          
          result
            .filter((item: any) => !item.disabled || item.disabled === 0)
            .forEach((item: any) => {
              const uoms = uomList
                .filter((ud: any) => ud.parent === item.item_code)
                .map((ud: any) => ({
                  uom: ud.uom,
                  conversion_factor: ud.conversion_factor,
                }));
              
              if (item.uom && !uoms.some((u: any) => u.uom === item.uom)) {
                uoms.push({ uom: item.uom, conversion_factor: 1 });
              }
              if (item.stock_uom && !uoms.some((u: any) => u.uom === item.stock_uom)) {
                uoms.push({ uom: item.stock_uom, conversion_factor: 1 });
              }
              item.uoms = uoms;
              
              const pricesMap: Record<string, number> = {};
              if (item.price_list_rate !== undefined) {
                pricesMap[item.uom || item.stock_uom] = item.price_list_rate;
              }
              priceListRecords
                .filter((pd: any) => pd.item_code === item.item_code)
                .forEach((pd: any) => {
                  if (pd.uom && pd.price_list_rate !== undefined) {
                    pricesMap[pd.uom] = pd.price_list_rate;
                  }
                });
              item.prices = pricesMap;
              item.price_list_name = priceList;
              
              store.put(item);
            });
          
          await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          
          console.log(`[POSStore] Pre-fetched and cached items ${start} to ${start + result.length}`);
        }
        
        if (result.length < batchSize) {
          hasMore = false;
        } else {
          start += batchSize;
          await new Promise(r => setTimeout(r, 250)); // small delay to avoid server hammering
        }
      } catch (err) {
        console.error('[POSStore] Background item pre-fetch batch failed:', err);
        hasMore = false;
      }
    }
    console.log('[POSStore] Background catalog pre-fetch finished.');
  }

  async function prefetchAllCustomers() {
    if (!session.value || !network.isOnline) return;
    console.log('[POSStore] Starting background customer pre-fetch...');
    
    let start = 0;
    const batchSize = 500;
    let hasMore = true;
    const customerGroups = session.value.customer_groups || [];
    
    while (hasMore) {
      try {
        const filters: Record<string, any> = { disabled: 0 };
        if (customerGroups.length) {
          filters.customer_group = ['in', customerGroups];
        }
        
        console.log(`[POSStore] Prefetching Customers (start: ${start}, length: ${batchSize}) from server...`);
        const result = await call('frappe.client.get_list', {
          doctype: 'Customer',
          filters,
          fields: ['name', 'customer_name', 'mobile_no', 'email_id', 'customer_group', 'loyalty_program'],
          limit_start: start,
          limit_page_length: batchSize,
        });
        
        const customersList: any[] = result || [];
        
        if (customersList.length > 0) {
          const { cacheCustomers } = await import('../db/posDB');
          await cacheCustomers(customersList);
          console.log(`[POSStore] Pre-fetched and cached customers ${start} to ${start + customersList.length}`);
        }
        
        if (customersList.length < batchSize) {
          hasMore = false;
        } else {
          start += batchSize;
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (err) {
        console.error('[POSStore] Background customer pre-fetch batch failed:', err);
        hasMore = false;
      }
    }
    console.log('[POSStore] Background customer pre-fetch finished.');
  }

  async function fetchItemDetailsOfflineData(itemCode: string): Promise<{
    uoms: Array<{ uom: string; conversion_factor: number }>;
    prices: Record<string, number>;
  }> {
    const priceList = session.value?.price_list || 'Standard Selling';
    // 1. Try to read from IndexedDB items cache
    try {
      const db = await openPOSDB();
      const tx = db.transaction('items', 'readonly');
      const store = tx.objectStore('items');
      const cachedItem = await new Promise<any>((resolve) => {
        const req = store.get(itemCode);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });

      if (cachedItem && cachedItem.uoms && cachedItem.prices && cachedItem.price_list_name === priceList) {
        return {
          uoms: cachedItem.uoms,
          prices: cachedItem.prices,
        };
      }

      // 2. If online, fetch from ERPNext
      if (network.isOnline) {
        try {
          console.log(`[POSStore] Fetching Item "${itemCode}" details and Item Price records (Price List: "${priceList}") from server...`);
          const itemDoc = await call('frappe.client.get', {
            doctype: 'Item',
            name: itemCode,
          });
          const uoms = itemDoc?.uoms || [];

          const priceRecords = await call('frappe.client.get_list', {
            doctype: 'Item Price',
            filters: {
              item_code: itemCode,
              price_list: priceList,
            },
            fields: ['uom', 'price_list_rate'],
            limit_page_length: 100,
          }) || [];

          const pricesMap: Record<string, number> = {};
          if (cachedItem) {
            if (cachedItem.price_list_rate !== undefined) {
              pricesMap[cachedItem.uom || cachedItem.stock_uom] = cachedItem.price_list_rate;
            }
          }
          priceRecords.forEach((pr: any) => {
            if (pr.uom && pr.price_list_rate !== undefined) {
              pricesMap[pr.uom] = pr.price_list_rate;
            }
          });

          if (cachedItem) {
            cachedItem.uoms = uoms;
            cachedItem.prices = pricesMap;
            cachedItem.price_list_name = priceList;
            const writeTx = db.transaction('items', 'readwrite');
            const writeStore = writeTx.objectStore('items');
            writeStore.put(cachedItem);
          }
          return { uoms, prices: pricesMap };
        } catch (onlineErr) {
          console.warn('[POSStore] Online fetch of item details failed, falling back to local data:', onlineErr);
        }
      }

      // 3. Fallback for offline mode if they were not cached
      if (cachedItem) {
        const uoms = cachedItem.uoms || [
          { uom: cachedItem.uom || cachedItem.stock_uom, conversion_factor: 1 }
        ];
        const prices: Record<string, number> = {};
        if (cachedItem.price_list_name === priceList && cachedItem.prices) {
          Object.assign(prices, cachedItem.prices);
        } else {
          prices[cachedItem.uom || cachedItem.stock_uom] = cachedItem.price_list_rate || 0;
        }
        return { uoms, prices };
      }
    } catch (e) {
      console.warn('[POSStore] Failed to fetch item details offline data:', e);
    }
    return { uoms: [], prices: {} };
  }


  async function decrementStock(itemsToDecrement: CartItem[]) {
    try {
      const db = await openPOSDB();

      // Step 1: Read all cached items in a single readonly transaction first
      const cachedItemsMap: Record<string, any> = {};
      const readTx = db.transaction('items', 'readonly');
      const readStore = readTx.objectStore('items');

      const readPromises = itemsToDecrement.map((cartItem) => {
        return new Promise<void>((resolve) => {
          const req = readStore.get(cartItem.item_code);
          req.onsuccess = () => {
            if (req.result) {
              cachedItemsMap[cartItem.item_code] = req.result;
            }
            resolve();
          };
          req.onerror = () => resolve();
        });
      });
      await Promise.all(readPromises);

      // Step 2: Write updates in a single, synchronous readwrite transaction
      const writeTx = db.transaction('items', 'readwrite');
      const writeStore = writeTx.objectStore('items');

      for (const cartItem of itemsToDecrement) {
        const decQty = cartItem.qty * (cartItem.conversion_factor || 1);
        // Update reactive state
        const matchedItem = items.value.find((i) => i.item_code === cartItem.item_code);
        if (matchedItem && matchedItem.is_stock_item) {
          matchedItem.actual_qty = Math.max(0, matchedItem.actual_qty - decQty);
        }

        // Update local DB cache
        const cachedItem = cachedItemsMap[cartItem.item_code];
        if (cachedItem && cachedItem.is_stock_item) {
          cachedItem.actual_qty = Math.max(0, (cachedItem.actual_qty || 0) - decQty);
          writeStore.put(cachedItem);
        }
      }

      await new Promise<void>((resolve, reject) => {
        writeTx.oncomplete = () => resolve();
        writeTx.onerror = () => reject(writeTx.error);
      });

      // Step 3: Decrement local Serials and Batches in memory and IndexedDB
      const sbTx = db.transaction('serial_batch_data', 'readwrite');
      const sbStore = sbTx.objectStore('serial_batch_data');

      for (const cartItem of itemsToDecrement) {
        const meta = serialBatchMap.value[cartItem.item_code];
        if (!meta) continue;

        // 1. Extract all unique serials to decrement (case-insensitive)
        const serialsToDecrement = new Set<string>();
        if (cartItem.serial_no) {
          cartItem.serial_no.split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean).forEach(s => serialsToDecrement.add(s));
        }
        if (cartItem.allocations) {
          cartItem.allocations.forEach(alloc => {
            if (alloc.serial_no) {
              alloc.serial_no.split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean).forEach(s => serialsToDecrement.add(s));
            }
          });
        }

        // 2. Extract all batches to decrement
        const batchQtyMap = new Map<string, number>(); // batch_no -> qty
        if (cartItem.batch_no) {
          const allocatedQty = cartItem.qty * (cartItem.conversion_factor || 1);
          batchQtyMap.set(cartItem.batch_no, allocatedQty);
        }
        if (cartItem.allocations) {
          cartItem.allocations.forEach(alloc => {
            if (alloc.batch_no) {
              const allocatedQty = alloc.qty * (cartItem.conversion_factor || 1);
              // Since allocations represent the breakdown, overwrite or add
              batchQtyMap.set(alloc.batch_no, allocatedQty);
            }
          });
        }

        // 3. Decrement serials
        if (meta.has_serial_no && serialsToDecrement.size > 0) {
          meta.serials.forEach(s => {
            if (serialsToDecrement.has(s.serial_no.toLowerCase())) {
              s.status = 'Delivered';
            }
          });
        }

        // 4. Decrement batches
        if (meta.has_batch_no && batchQtyMap.size > 0) {
          batchQtyMap.forEach((qtyToDecrement, batchNo) => {
            const batch = meta.batches.find(b => b.batch_no === batchNo);
            if (batch) {
              batch.qty = Math.max(0, batch.qty - qtyToDecrement);
            }
          });
          meta.batches = meta.batches.filter(b => b.qty > 0);
        }

        sbStore.put({
          item_code: cartItem.item_code,
          has_serial_no: meta.has_serial_no,
          has_batch_no: meta.has_batch_no,
          serials: meta.serials,
          batches: meta.batches,
        });
      }

      await new Promise<void>((resolve, reject) => {
        sbTx.oncomplete = () => resolve();
        sbTx.onerror = () => reject(sbTx.error);
      });

    } catch (e) {
      console.warn('[POSStore] Failed to decrement local stock:', e);
    }
  }

  async function checkCartStock(): Promise<{ valid: boolean; error?: string }> {
    const db = await openPOSDB();
    const readTx = db.transaction('items', 'readonly');
    const readStore = readTx.objectStore('items');
    
    const cachedItemsMap: Record<string, any> = {};
    const readPromises = cartItems.value.map((cartItem) => {
      return new Promise<void>((resolve) => {
        const req = readStore.get(cartItem.item_code);
        req.onsuccess = () => {
          if (req.result) {
            cachedItemsMap[cartItem.item_code] = req.result;
          }
          resolve();
        };
        req.onerror = () => resolve();
      });
    });
    await Promise.all(readPromises);

    for (let idx = 0; idx < cartItems.value.length; idx++) {
      const ci = cartItems.value[idx];
      if (ci.is_stock_item !== 1) continue;

      const meta = serialBatchMap.value[ci.item_code];
      const catalogItem = items.value.find((i) => i.item_code === ci.item_code);
      const dbItem = cachedItemsMap[ci.item_code];

      let actualQty = catalogItem?.actual_qty !== undefined ? catalogItem.actual_qty : (dbItem?.actual_qty !== undefined ? dbItem.actual_qty : 0);

      if (meta) {
        if (meta.has_serial_no) {
          const activeSerials = meta.serials.filter(s => (s.status || 'Active') === 'Active');
          actualQty = activeSerials.length;
        } else if (meta.has_batch_no) {
          actualQty = meta.batches.reduce((sum, b) => sum + b.qty, 0);
        }
      }

      const neededQty = ci.qty * (ci.conversion_factor || 1);
      if (neededQty > actualQty) {
        const factor = ci.conversion_factor || 1;
        const maxAllowed = Math.floor((actualQty / factor) * 1000) / 1000;
        let message = `in cart, for item: "${ci.item_name}" in row no ${idx + 1}, you added ${ci.qty} ${ci.uom}`;
        if (ci.conversion_factor && ci.conversion_factor !== 1) {
          message += `, UOM conversion factor is ${ci.qty}*${ci.conversion_factor}=${neededQty} Unit need in the stock but available only ${actualQty}qty`;
        } else {
          message += ` need in the stock but available only ${actualQty}qty`;
        }
        message += `\nMaximum allowed quantity is ${maxAllowed} ${ci.uom}.`;
        message += `\n\nplease fix it and sale`;
        
        return {
          valid: false,
          error: message
        };
      }
    }
    return { valid: true };
  }

  function addScannedItemToCart(item: POSItem, batchNo: string, serialNo: string) {
    const meta = serialBatchMap.value[item.item_code];
    let actualQty = item.actual_qty;
    if (meta) {
      if (meta.has_serial_no) {
        actualQty = meta.serials.length;
      } else if (meta.has_batch_no) {
        actualQty = meta.batches.reduce((sum, b) => sum + b.qty, 0);
      }
    }

    let uom = item.uom;
    let rate = item.price_list_rate || 0;
    let conversionFactor = 1;
    if (meta && (meta.has_serial_no || meta.has_batch_no)) {
      uom = item.stock_uom || item.uom || 'Nos';
      conversionFactor = 1;
      rate = item.price_list_rate || 0;
    }

    if (!serialNo && batchNo && meta && meta.has_serial_no) {
      const currentCartSerials = cartItems.value
        .filter(ci => ci.item_code === item.item_code)
        .flatMap(ci => ci.allocations || [])
        .flatMap(a => a.serial_no.split(/[\n,]+/).map(s => s.trim()).filter(Boolean));

      const availableSerial = meta.serials.find(
        s => s.batch_no === batchNo && (s.status || 'Active') === 'Active' && !currentCartSerials.includes(s.serial_no)
      );

      if (availableSerial) {
        serialNo = availableSerial.serial_no;
      } else {
        showAlert("Out of Serials", `No available serial numbers found in batch ${batchNo}.`);
        return;
      }
    }

    const targetBatch = batchNo || '';
    const existingIdx = cartItems.value.findIndex(
      (ci) => ci.item_code === item.item_code && ci.uom === uom && (ci.batch_no || '') === targetBatch
    );

    if (existingIdx !== -1) {
      const existing = cartItems.value[existingIdx];

      const neededQty = (existing.qty + 1) * (existing.conversion_factor || 1);
      if (item.is_stock_item && neededQty > actualQty) {
        const factor = existing.conversion_factor || 1;
        const maxAllowed = Math.floor((actualQty / factor) * 1000) / 1000;
        showAlert("Stock Limit Exceeded", `Cannot add more. Only ${actualQty} stock available. Maximum allowed quantity is ${maxAllowed} ${existing.uom}.`);
        return;
      }

      if (!existing.allocations) {
        existing.allocations = [];
      }

      if (serialNo) {
        const allSerials = existing.allocations.flatMap(a =>
          a.serial_no.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
        );

        if (allSerials.includes(serialNo)) {
          showAlert("Already Added", `Serial number ${serialNo} is already in the cart.`);
          selectCartItem(existingIdx);
          return;
        }

        // UX Optimization: Check if there's an empty slot (qty > number of assigned serials)
        const totalSerialsCount = existing.allocations.reduce((sum, a) => {
          return sum + (a.serial_no ? a.serial_no.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length : 0);
        }, 0);

        if (totalSerialsCount < existing.qty) {
          let alloc = existing.allocations.find(a => a.batch_no === batchNo);
          if (!alloc) {
            alloc = existing.allocations[0] || { batch_no: batchNo, serial_no: '', qty: 0 };
            if (existing.allocations.length === 0) {
              existing.allocations.push(alloc);
            }
          }
          const currentSerials = alloc.serial_no
            ? alloc.serial_no.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
            : [];
          currentSerials.push(serialNo);
          alloc.serial_no = currentSerials.join('\n');
          
          const allocSerialsCount = currentSerials.length;
          if (alloc.qty < allocSerialsCount) {
            alloc.qty = allocSerialsCount;
          }
          
          existing.serial_no = existing.allocations.map(a => a.serial_no).filter(Boolean).join('\n');
          selectCartItem(existingIdx);
          return;
        }

        if (item.is_stock_item && existing.qty + 1 > actualQty) {
          showAlert("Stock Limit Exceeded", `Cannot add more. Only ${actualQty} stock available.`);
          return;
        }

        let alloc = existing.allocations.find(a => a.batch_no === batchNo);
        if (!alloc) {
          alloc = { batch_no: batchNo, serial_no: '', qty: 0 };
          existing.allocations.push(alloc);
        }
        const currentSerials = alloc.serial_no
          ? alloc.serial_no.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
          : [];
        currentSerials.push(serialNo);
        alloc.serial_no = currentSerials.join('\n');
        alloc.qty += 1;
      } else if (batchNo) {
        let alloc = existing.allocations.find(a => a.batch_no === batchNo);
        if (!alloc) {
          alloc = { batch_no: batchNo, serial_no: '', qty: 0 };
          existing.allocations.push(alloc);
        }
        alloc.qty += 1;
      }

      existing.qty += 1;
      existing.amount = existing.qty * existing.rate;
      
      existing.batch_no = existing.allocations[0]?.batch_no || '';
      existing.serial_no = existing.allocations.map(a => a.serial_no).filter(Boolean).join('\n');
      
      selectCartItem(existingIdx);
    } else {
      if (item.is_stock_item && conversionFactor > actualQty) {
        const maxAllowed = Math.floor((actualQty / conversionFactor) * 1000) / 1000;
        showAlert("Stock Limit Exceeded", `Cannot add. Only ${actualQty} stock available. Maximum allowed quantity is ${maxAllowed} ${uom}.`);
        return;
      }
      const newCartItem: CartItem = {
        item_code: item.item_code,
        item_name: item.item_name,
        qty: 1,
        rate: rate,
        amount: rate,
        uom: uom,
        discount_percentage: 0,
        batch_no: batchNo,
        serial_no: serialNo || '',
        warehouse: session.value?.warehouse || '',
        item_tax_template: item.item_tax_template,
        item_tax_rate: item.item_tax_rate,
        conversion_factor: conversionFactor,
        price_list_rate: rate,
        original_price_list_rate: rate,
        is_stock_item: item.is_stock_item ? 1 : 0,
        has_batch_no: item.has_batch_no || 0,
        has_serial_no: item.has_serial_no || 0,
        allocations: []
      };

      if (serialNo) {
        newCartItem.allocations = [{ batch_no: batchNo, serial_no: serialNo, qty: 1 }];
      } else if (batchNo) {
        newCartItem.allocations = [{ batch_no: batchNo, serial_no: '', qty: 1 }];
      } else if (meta && (meta.has_serial_no || meta.has_batch_no)) {
        newCartItem.allocations = autoSelectSerialsAndBatches(item.item_code, conversionFactor, null, '', conversionFactor);
        newCartItem.batch_no = newCartItem.allocations[0]?.batch_no || '';
        newCartItem.serial_no = newCartItem.allocations.map(a => a.serial_no).filter(Boolean).join('\n');
      }

      cartItems.value.push(newCartItem);
      selectCartItem(cartItems.value.length - 1);
    }
  }

  async function handleBarcodeScanOrSearch(term: string): Promise<boolean> {
    const cleanTerm = term.trim();
    if (!cleanTerm) return false;

    let matchedItemCode = '';
    let matchedSerialNo = '';
    let matchedBatchNo = '';

    for (const [itemCode, data] of Object.entries(serialBatchMap.value)) {
      const foundSerial = data.serials.find(
        (s) => s.serial_no.toLowerCase() === cleanTerm.toLowerCase()
      );
      if (foundSerial) {
        if (network.isOnline) {
          await refreshItemSerialBatchDataFromServer(itemCode);
          const freshData = serialBatchMap.value[itemCode];
          const freshSerial = freshData?.serials.find(
            (s) => s.serial_no.toLowerCase() === cleanTerm.toLowerCase()
          );
          if (!freshSerial || (freshSerial.status || 'Active') !== 'Active') {
            showAlert("Invalid Serial", `Serial number ${cleanTerm} is not active on the server.`);
            return true;
          }
          matchedItemCode = itemCode;
          matchedSerialNo = freshSerial.serial_no;
          matchedBatchNo = freshSerial.batch_no || '';
        } else {
          if ((foundSerial.status || 'Active') !== 'Active') {
            showAlert("Invalid Serial", `Serial number ${cleanTerm} is already sold or inactive.`);
            return true;
          }
          matchedItemCode = itemCode;
          matchedSerialNo = foundSerial.serial_no;
          matchedBatchNo = foundSerial.batch_no || '';
        }
        break;
      }
    }

    if (!matchedItemCode) {
      for (const [itemCode, data] of Object.entries(serialBatchMap.value)) {
        const foundBatch = data.batches.find(
          (b) => b.batch_no.toLowerCase() === cleanTerm.toLowerCase()
        );
        if (foundBatch) {
          matchedItemCode = itemCode;
          matchedBatchNo = foundBatch.batch_no;
          break;
        }
      }
    }

    if (matchedItemCode) {
      let catalogItem = items.value.find((i) => i.item_code === matchedItemCode);
      if (!catalogItem) {
        const db = await openPOSDB();
        catalogItem = await new Promise<any>((resolve) => {
          const req = db.transaction('items', 'readonly').objectStore('items').get(matchedItemCode);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });
      }

      if (!catalogItem) {
        console.error(`[POSStore] Scanned item ${matchedItemCode} not found in catalog.`);
        return false;
      }

      addScannedItemToCart(catalogItem, matchedBatchNo, matchedSerialNo);
      return true;
    }

    try {
      const item = await fetchItemByBarcode(
        cleanTerm,
        session.value?.price_list || '',
        session.value?.warehouse || '',
        network.isOnline
      );
      if (item) {
        const baseUom = item.uom || item.stock_uom || 'Nos';
        const existingIdx = cartItems.value.findIndex(
          (ci) => ci.item_code === item.item_code && ci.uom === baseUom
        );
        if (existingIdx !== -1) {
          addQtyToExistingRow(existingIdx);
        } else {
          await addToCart(item, true);
        }
        return true;
      }
    } catch (e) {
      console.warn('[POSStore] Barcode lookup failed:', e);
    }

    return false;
  }


  function clearSession() {
    session.value = null;
    localStorage.removeItem('pos_default_customer_name');
    clearCart();
    items.value = [];
    customers.value = [];
    warehouses.value = [];
  }

  // Load default customer if not set
  if (!selectedCustomer.value) {
    const defCustName = localStorage.getItem('pos_default_customer_name');
    if (defCustName) {
      setDefaultCustomer(defCustName);
    }
  }

  if (selectedCustomer.value) {
    fetchCustomerBalance(selectedCustomer.value.name);
  }

  // ─── Held Invoices Actions ────────────────────────────────────────────────
  async function loadHeldInvoices() {
    heldInvoices.value = await getHoldInvoices();
  }

  async function holdCurrentCart() {
    if (cartItems.value.length === 0) return;

    const holdData = JSON.parse(JSON.stringify({
      customer: selectedCustomer.value,
      cartItems: cartItems.value,
      cartDiscount: cartDiscount.value,
      additionalDiscount: additionalDiscount.value,
      discountType: discountType.value,
      created_at: new Date().toISOString(),
      grand_total: roundedTotal.value,
    }));

    if (currentDraftId.value !== null) {
      await updateHoldInvoice(currentDraftId.value, holdData);
    } else {
      await saveHoldInvoice(holdData);
    }

    clearCart();
    await loadHeldInvoices();
  }

  async function resumeHeldInvoice(localId: number) {
    const list = await getHoldInvoices();
    const draft = list.find((d: any) => d.local_id === localId);
    if (!draft) throw new Error('Draft not found.');

    // Restore state
    cartItems.value = draft.cartItems || [];
    selectedCustomer.value = draft.customer || null;
    cartDiscount.value = draft.cartDiscount || 0;
    additionalDiscount.value = draft.additionalDiscount || 0;
    discountType.value = draft.discountType || 'percent';
    currentDraftId.value = localId;

    if (selectedCustomer.value) {
      await fetchCustomerBalance(selectedCustomer.value.name);
    }

    await loadHeldInvoices();
  }

  async function discardHeldInvoice(localId: number) {
    await deleteHoldInvoice(localId);
    if (currentDraftId.value === localId) {
      currentDraftId.value = null;
    }
    await loadHeldInvoices();
  }

  return {
    // Session
    session, isSessionLoading, initSession, clearSession, fetchPOSSettings,
    // Items
    items, itemGroups, selectedGroup, searchTerm, itemsLoading,
    loadItems, searchItems, filterByGroup, prefetchAllItems,
    // Customers
    customers, customerSearch, customersLoading,
    loadCustomers, selectCustomer, prefetchAllCustomers,
    selectedCustomerBalance, fetchCustomerBalance, updateOfflineCustomerBalance,
    // Cart
    cartItems, selectedCustomer, cartDiscount, additionalDiscount, discountType,
    selectedItemIdx, warehouses, selectedCartItem,
    addToCart, removeFromCart, updateQty, updateRate, updateDiscount,
    selectCartItem, updateCartItemWarehouse, updateCartItemUOM, updateCartItemConversionFactor, updateCartItemPrice,
    clearCart, setAdditionalDiscountPercent, setAdditionalDiscountAmount, fetchItemDetailsOfflineData, decrementStock, checkCartStock,
    // Serial & Batch
    serialBatchMap, pickStrategy, getAvailableStockPool, autoSelectSerialsAndBatches, handleCartItemQtyChange, handleBarcodeScanOrSearch, refreshSerialBatchDataFromServer, refreshItemSerialBatchDataFromServer,
    // designed alert & toast
    activeAlert, showAlert, closeAlert, saveFailedOnlineInvoiceToSyncQueue, toast, showToast,
    duplicateItemAlert, closeDuplicateItemAlert, addQtyToExistingRow, forceAddToCart,
    // Totals
    subtotal, totalDiscount, grandTotal, roundedTotal, roundingAdjustment, cartCount, taxes, totalTaxes,
    // Held Invoices
    heldInvoices, currentDraftId, loadHeldInvoices, holdCurrentCart, resumeHeldInvoice, discardHeldInvoice,
  };
});

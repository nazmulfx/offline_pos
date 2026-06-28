/**
 * posStore.ts — Main POS state management (Pinia)
 * Manages: session, cart, items, customers, item groups
 */
import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useNetworkStore } from './networkStore';
import { fetchItems } from '../services/itemService';
import { fetchCustomers } from '../services/customerService';
import { getAllItemGroups, openPOSDB } from '../db/posDB';
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
  is_stock_item?: number;
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
  print_format?: string;
  print_receipt_on_order_complete?: number;
  allow_partial_payment?: number;
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
  const warehouses = ref<string[]>([]);

  // ─── Designed Alert Modal ──────────────────────────────────────────────────
  const activeAlert = ref<{ title: string; message: string } | null>(null);

  function showAlert(title: string, message: string) {
    activeAlert.value = { title, message };
  }

  function closeAlert() {
    activeAlert.value = null;
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
    } else {
      localStorage.removeItem('pos_selected_customer');
    }
  });

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

          result.forEach((item: any) => {
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

  function addToCart(item: POSItem) {
    if (item.is_stock_item && (item.actual_qty === undefined || item.actual_qty <= 0)) {
      showAlert("Out of Stock", "stock is available to this warehouse is zero. can't add to cart");
      return;
    }

    const itemBatchNo = item.batch_no || '';
    const existing = cartItems.value.find(
      (ci) => ci.item_code === item.item_code && ci.batch_no === itemBatchNo
    );
    if (existing) {
      if (item.is_stock_item && existing.qty + 1 > item.actual_qty) {
        showAlert("Stock Limit Exceeded", `Cannot add more. Only ${item.actual_qty} stock available.`);
        return;
      }
      existing.qty += 1;
      existing.amount = existing.qty * existing.rate;
      
      const idx = cartItems.value.findIndex(
        (ci) => ci.item_code === item.item_code && ci.batch_no === itemBatchNo
      );
      if (idx !== -1) {
        selectCartItem(idx);
      }
    } else {
      cartItems.value.push({
        item_code: item.item_code,
        item_name: item.item_name,
        qty: 1,
        rate: item.price_list_rate || 0,
        amount: item.price_list_rate || 0,
        uom: item.uom,
        discount_percentage: 0,
        batch_no: itemBatchNo,
        warehouse: session.value?.warehouse || '',
        item_tax_template: item.item_tax_template,
        item_tax_rate: item.item_tax_rate,
        conversion_factor: 1,
        price_list_rate: item.price_list_rate || 0,
        is_stock_item: item.is_stock_item ? 1 : 0,
      });
      selectCartItem(cartItems.value.length - 1);
    }
  }

  function selectCartItem(idx: number | null) {
    selectedItemIdx.value = idx;
  }

  function removeFromCart(item_code: string, batch_no: string = '') {
    const indexToRemove = cartItems.value.findIndex(
      (ci) => ci.item_code === item_code && ci.batch_no === batch_no
    );
    if (indexToRemove !== -1 && selectedItemIdx.value === indexToRemove) {
      selectedItemIdx.value = null;
    } else if (indexToRemove !== -1 && selectedItemIdx.value !== null && indexToRemove < selectedItemIdx.value) {
      selectedItemIdx.value -= 1;
    }
    cartItems.value = cartItems.value.filter(
      (ci) => !(ci.item_code === item_code && ci.batch_no === batch_no)
    );
  }

  function updateQty(item_code: string, qty: number, batch_no: string = '') {
    const item = cartItems.value.find(
      (ci) => ci.item_code === item_code && ci.batch_no === batch_no
    );
    if (!item) return;
    if (qty <= 0) {
      removeFromCart(item_code, batch_no);
      return;
    }

    const catalogItem = items.value.find((i) => i.item_code === item_code);
    if (catalogItem && catalogItem.is_stock_item) {
      if (qty > catalogItem.actual_qty) {
        showAlert("Stock Limit Exceeded", `Cannot set quantity to ${qty}. Only ${catalogItem.actual_qty} stock available.`);
        return;
      }
    }

    item.qty = qty;
    item.amount = qty * item.rate;
  }

  function updateRate(item_code: string, rate: number, batch_no: string = '') {
    const item = cartItems.value.find(
      (ci) => ci.item_code === item_code && ci.batch_no === batch_no
    );
    if (!item) return;
    item.rate = rate;
    const priceListRate = item.price_list_rate || rate;
    if (priceListRate > 0 && rate < priceListRate) {
      item.discount_percentage = ((priceListRate - rate) / priceListRate) * 100;
    } else {
      item.discount_percentage = 0;
      if (rate > priceListRate) {
        item.price_list_rate = rate;
      }
    }
    item.amount = item.qty * rate;
  }

  function updateDiscount(item_code: string, pct: number, batch_no: string = '') {
    const item = cartItems.value.find(
      (ci) => ci.item_code === item_code && ci.batch_no === batch_no
    );
    if (!item) return;
    item.discount_percentage = pct;
    const priceListRate = item.price_list_rate || item.rate;
    item.rate = priceListRate * (1 - pct / 100);
    item.amount = item.qty * item.rate;
  }

  function updateCartItemWarehouse(item_code: string, warehouse: string, batch_no: string = '') {
    const item = cartItems.value.find(
      (ci) => ci.item_code === item_code && ci.batch_no === batch_no
    );
    if (item) {
      item.warehouse = warehouse;
    }
  }

  function updateCartItemUOM(item_code: string, uom: string, batch_no: string = '') {
    const item = cartItems.value.find(
      (ci) => ci.item_code === item_code && ci.batch_no === batch_no
    );
    if (item) {
      item.uom = uom;
    }
  }

  function updateCartItemConversionFactor(item_code: string, factor: number, batch_no: string = '') {
    const item = cartItems.value.find(
      (ci) => ci.item_code === item_code && ci.batch_no === batch_no
    );
    if (item) {
      item.conversion_factor = factor;
    }
  }

  function updateCartItemPrice(item_code: string, priceListRate: number, batch_no: string = '') {
    const item = cartItems.value.find(
      (ci) => ci.item_code === item_code && ci.batch_no === batch_no
    );
    if (!item) return;
    item.price_list_rate = priceListRate;
    const pct = item.discount_percentage || 0;
    item.rate = priceListRate * (1 - pct / 100);
    item.amount = item.qty * item.rate;
  }

  function clearCart() {
    cartItems.value = [];
    selectedCustomer.value = null;
    cartDiscount.value = 0;
    additionalDiscount.value = 0;
    selectedItemIdx.value = null;
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

  const cartCount = computed(() =>
    cartItems.value.reduce((sum, ci) => sum + ci.qty, 0)
  );

  function setAdditionalDiscountPercent(val: number) {
    discountType.value = 'percent';
    cartDiscount.value = val;
    additionalDiscount.value = parseFloat((discountBase.value * (val / 100)).toFixed(2));
  }

  function setAdditionalDiscountAmount(val: number) {
    discountType.value = 'amount';
    additionalDiscount.value = val;
    cartDiscount.value = discountBase.value > 0
      ? parseFloat(((val / discountBase.value) * 100).toFixed(4))
      : 0;
  }

  watch([subtotal, totalTaxes], () => {
    if (discountType.value === 'percent') {
      additionalDiscount.value = parseFloat((discountBase.value * (cartDiscount.value / 100)).toFixed(2));
    } else {
      cartDiscount.value = discountBase.value > 0
        ? parseFloat(((additionalDiscount.value / discountBase.value) * 100).toFixed(4))
        : 0;
    }
  });

  // ─── Session ─────────────────────────────────────────────────────────────

  async function initSession(openingEntry: any, profileData: any) {
    // Fetch invoice_type from POS Settings (Sales Invoice or POS Invoice)
    let invoiceType: 'POS Invoice' | 'Sales Invoice' = 'POS Invoice';
    try {
      const posSettings = await call('frappe.client.get_single_value', {
        doctype: 'POS Settings',
        field: 'invoice_type',
      });
      if (posSettings === 'Sales Invoice') invoiceType = 'Sales Invoice';
    } catch {
      console.warn('[POSStore] Could not fetch POS Settings invoice_type, defaulting to POS Invoice');
    }

    let fullOpeningEntry = openingEntry;
    if (!openingEntry.balance_details) {
      try {
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
      print_format: profileData.print_format || '',
      print_receipt_on_order_complete: profileData.print_receipt_on_order_complete || 0,
      allow_partial_payment: profileData.allow_partial_payment,
    };

    // Load and cache warehouses list
    try {
      if (network.isOnline) {
        const whList = await call('frappe.client.get_list', {
          doctype: 'Warehouse',
          fields: ['name'],
          limit_page_length: 500,
        });
        warehouses.value = (whList || []).map((w: any) => w.name);
        localStorage.setItem('pos_warehouses', JSON.stringify(warehouses.value));
      } else {
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
      const tx = db.transaction('items', 'readwrite');
      const store = tx.objectStore('items');

      for (const cartItem of itemsToDecrement) {
        const matchedItem = items.value.find((i) => i.item_code === cartItem.item_code);
        if (matchedItem && matchedItem.is_stock_item) {
          matchedItem.actual_qty = Math.max(0, matchedItem.actual_qty - cartItem.qty);

          const cachedItem = await new Promise<any>((resolve) => {
            const req = store.get(cartItem.item_code);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          });
          if (cachedItem) {
            cachedItem.actual_qty = Math.max(0, (cachedItem.actual_qty || 0) - cartItem.qty);
            store.put(cachedItem);
          }
        }
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[POSStore] Failed to decrement local stock:', e);
    }
  }

  function clearSession() {
    session.value = null;
    clearCart();
    items.value = [];
    customers.value = [];
    warehouses.value = [];
  }

  return {
    // Session
    session, isSessionLoading, initSession, clearSession,
    // Items
    items, itemGroups, selectedGroup, searchTerm, itemsLoading,
    loadItems, searchItems, filterByGroup,
    // Customers
    customers, customerSearch, customersLoading,
    loadCustomers, selectCustomer,
    // Cart
    cartItems, selectedCustomer, cartDiscount, additionalDiscount, discountType,
    selectedItemIdx, warehouses, selectedCartItem,
    addToCart, removeFromCart, updateQty, updateRate, updateDiscount,
    selectCartItem, updateCartItemWarehouse, updateCartItemUOM, updateCartItemConversionFactor, updateCartItemPrice,
    clearCart, setAdditionalDiscountPercent, setAdditionalDiscountAmount, fetchItemDetailsOfflineData, decrementStock,
    // designed alert
    activeAlert, showAlert, closeAlert,
    // Totals
    subtotal, totalDiscount, grandTotal, cartCount, taxes, totalTaxes,
  };
});

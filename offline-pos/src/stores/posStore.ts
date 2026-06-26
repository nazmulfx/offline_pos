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
}


export const usePOSStore = defineStore('pos', () => {
  const network = useNetworkStore();

  // ─── Session ──────────────────────────────────────────────────────────────
  const session = ref<POSSession | null>(null);
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
  const cartItems = ref<CartItem[]>([]);
  const selectedCustomer = ref<Customer | null>(null);
  const cartDiscount = ref<number>(0); // global discount %
  const additionalDiscount = ref<number>(0); // flat amount
  const discountType = ref<'percent' | 'amount'>('percent');
  const selectedItemIdx = ref<number | null>(null);
  const warehouses = ref<string[]>([]);

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
    const itemBatchNo = item.batch_no || '';
    const existing = cartItems.value.find(
      (ci) => ci.item_code === item.item_code && ci.batch_no === itemBatchNo
    );
    if (existing) {
      existing.qty += 1;
      existing.amount = existing.qty * existing.rate;
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
      });
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

  async function fetchItemUOMConversionFactors(itemCode: string): Promise<Array<{ uom: string; conversion_factor: number }>> {
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

      if (cachedItem && cachedItem.uoms && cachedItem.uoms.length > 0) {
        return cachedItem.uoms;
      }

      // 2. If online and no cached uoms, fetch the full item document from ERPNext
      if (network.isOnline) {
        const itemDoc = await call('frappe.client.get', {
          doctype: 'Item',
          name: itemCode,
        });
        const uoms = itemDoc?.uoms || [];
        if (cachedItem) {
          cachedItem.uoms = uoms;
          const writeTx = db.transaction('items', 'readwrite');
          const writeStore = writeTx.objectStore('items');
          writeStore.put(cachedItem);
        }
        return uoms;
      }
    } catch (e) {
      console.warn('[POSStore] Failed to fetch UOM conversion factors:', e);
    }
    return [];
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
    selectCartItem, updateCartItemWarehouse, updateCartItemUOM, updateCartItemConversionFactor,
    clearCart, setAdditionalDiscountPercent, setAdditionalDiscountAmount, fetchItemUOMConversionFactors,
    // Totals
    subtotal, totalDiscount, grandTotal, cartCount, taxes, totalTaxes,
  };
});

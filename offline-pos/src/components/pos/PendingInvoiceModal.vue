<!--
  PendingInvoiceModal.vue — Dialog to view full details of a pending/failed offline invoice.
  Styled exactly like ERPNext Desk Document Form (Frappe UI).
  Features realtime reloading animations for "Fetch & Auto Assign All" and "Auto Assign" buttons,
  visual row flash feedback, server stock refresh, batch & serial dropdown selection, and read-only financials.
-->
<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="frappe-modal-fade">
      <div v-if="isOpen && item" class="frappe-modal-backdrop" @click.self="closeModal" />
    </Transition>

    <!-- ERPNext Desk Modal Container -->
    <Transition name="frappe-modal-scale">
      <div v-if="isOpen && item" class="frappe-modal-dialog" @click.stop role="dialog" aria-modal="true" aria-label="Sales Invoice Details">

        <!-- ERPNext Form Header -->
        <div class="frappe-modal-header">
          <div class="frappe-title-area">
            <span class="frappe-doctype-tag">Sales Invoice</span>
            <h3 class="frappe-doc-name">
              {{ invoiceDoc?.name || item.payload?.local_id || item.payload?.invoice?.name || '' }}
            </h3>
          </div>

          <div class="frappe-header-meta">
            <!-- ERPNext Status Indicators -->
            <span v-if="errorMessage" class="frappe-indicator red">
              <span class="frappe-indicator-dot red"></span>
              Sync Failed
            </span>
            <span v-else-if="isBlocked" class="frappe-indicator orange">
              <span class="frappe-indicator-dot orange"></span>
              Blocked
            </span>
            <span v-else class="frappe-indicator blue">
              <span class="frappe-indicator-dot blue"></span>
              Pending Sync
            </span>

            <button class="frappe-close-btn" @click="closeModal" title="Close (Esc)">✕</button>
          </div>
        </div>

        <!-- Sync Error Alert Box (Frappe Alert Style) -->
        <div v-if="errorMessage" class="frappe-alert-danger">
          <div class="frappe-alert-head">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <strong>Sync Failure Error Details</strong>
          </div>
          <p class="frappe-alert-msg">{{ errorMessage }}</p>
          <div class="frappe-alert-tip">
            To resolve: Select available Batch / Serial numbers from the dropdowns below or click <strong>Fetch & Auto Assign All</strong>, then click <strong>Save & Update Queue</strong>.
          </div>
        </div>

        <!-- Modal Form Body -->
        <div class="frappe-modal-body">

          <!-- Section: Document Overview Details -->
          <div class="frappe-form-section">
            <div class="frappe-section-label">Details</div>
            <div class="frappe-details-card">
              <!-- Customer Selection Block -->
              <div class="frappe-customer-block">
                <div class="frappe-customer-header-row">
                  <span class="frappe-control-label">Customer</span>
                  <button
                    class="frappe-btn frappe-btn-primary-ghost frappe-btn-xs"
                    :disabled="isRefreshingCustomers"
                    @click.stop="refreshCustomersFromServer"
                    title="Fetch & update customer list from ERPNext server to IndexedDB"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      width="12"
                      height="12"
                      :class="{ 'frappe-spin-icon': isRefreshingCustomers }"
                    >
                      <path d="M23 4v6h-6M1 20v-6h6"/>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                    <span>{{ isRefreshingCustomers ? 'Updating…' : 'Update Customer List' }}</span>
                  </button>
                </div>

                <div class="frappe-customer-field-body">
                  <!-- Custom Searchable Select Component -->
                  <div class="frappe-searchable-picker" @click.stop>
                    <!-- Trigger Box -->
                    <div
                      class="picker-trigger-box"
                      :class="{ 'control-blocked': isBlocked || (editedCustomer && editedCustomer.startsWith('OFFLINE-')), active: isCustomerDropdownOpen }"
                      @click.stop="toggleCustomerPicker"
                    >
                      <div class="picker-selected-label">
                        <span class="bold-text">{{ selectedCustomerLabel }}</span>
                      </div>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="picker-chevron" :class="{ rotated: isCustomerDropdownOpen }">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>

                    <!-- Dropdown Panel with search box inside -->
                    <div v-if="isCustomerDropdownOpen" class="picker-dropdown-panel" @click.stop>
                      <div class="picker-search-header" @click.stop>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" class="search-icon">
                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input
                          ref="customerSearchInputRef"
                          type="text"
                          v-model="customerSearchQuery"
                          placeholder="Type to search IndexedDB customer list by name, code, or phone…"
                          class="picker-search-input"
                          @click.stop
                          @keydown.stop
                        />
                        <button v-if="customerSearchQuery" class="clear-search-btn" @click.stop="customerSearchQuery = ''" title="Clear search">✕</button>
                      </div>

                      <div class="picker-options-list" @click.stop>
                        <div v-if="filteredCustomers.length === 0" class="picker-no-results">
                          No matching customers found in local IndexedDB. Click <strong>Update Customer List</strong> to fetch from server.
                        </div>
                        <div
                          v-for="c in filteredCustomers"
                          :key="c.name"
                          class="picker-option-item"
                          :class="{ selected: editedCustomer === c.name }"
                          @click.stop="selectCustomer(c.name)"
                        >
                          <div class="option-title bold-text">{{ c.customer_name }}</div>
                          <div class="option-details">
                            <span class="option-id">{{ c.name }}</span>
                            <span v-if="c.mobile_no" class="option-phone"> • 📞 {{ c.mobile_no }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p v-if="isBlocked || (invoiceDoc?.customer || '').startsWith('OFFLINE-')" class="frappe-control-tip warning-tip">
                    ⚠️ Temporary customer "{{ invoiceDoc?.customer }}" is not synced. Select a real customer above (or click Update Customer List) to unblock this invoice.
                  </p>
                </div>
              </div>

              <!-- Metadata Grid -->
              <div class="frappe-control-grid">
                <div class="frappe-control">
                  <div class="frappe-control-label">Posting Date & Time</div>
                  <div class="frappe-control-value">{{ formattedDate }} {{ formattedTime }}</div>
                </div>

                <div class="frappe-control">
                  <div class="frappe-control-label">Company</div>
                  <div class="frappe-control-value">{{ invoiceDoc?.company }}</div>
                </div>

                <div class="frappe-control">
                  <div class="frappe-control-label">POS Profile / Warehouse</div>
                  <div class="frappe-control-value">
                    {{ invoiceDoc?.pos_profile }}
                    <template v-if="invoiceDoc?.set_warehouse"> ({{ invoiceDoc.set_warehouse }})</template>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Section: Items Table -->
          <div class="frappe-form-section">
            <div class="frappe-section-head-wrap">
              <div class="frappe-section-label">Items ({{ editedItems.length }})</div>
              
              <!-- Realtime Reloading Header Button -->
              <button
                class="frappe-btn frappe-btn-primary-ghost frappe-btn-xs"
                :class="{ 'btn-reloading': isRefreshingStock }"
                @click="autoAssignAll"
                :disabled="isRefreshingStock"
                title="Fetch latest stock from server & auto-assign batch/serials in real-time"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  width="13"
                  height="13"
                  :class="{ 'frappe-spin-icon': isRefreshingStock }"
                >
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                <span>{{ isRefreshingStock ? 'Realtime Reloading…' : 'Fetch & Auto Assign All' }}</span>
              </button>
            </div>

            <div class="frappe-grid-wrapper">
              <table class="frappe-grid-table">
                <thead>
                  <tr>
                    <th style="width: 38px;" class="text-center">No.</th>
                    <th style="width: 220px;">Item</th>
                    <th style="width: 75px;" class="text-right">Qty</th>
                    <th style="width: 95px;" class="text-right">Rate</th>
                    <th style="width: 105px;" class="text-right">Amount</th>
                    <th>Batch / Serial Allocation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(line, idx) in editedItems"
                    :key="idx"
                    class="frappe-grid-row"
                    :class="{
                      'row-reloading': refreshingItemCode === line.item_code || (isRefreshingStock && (line.has_batch_no || line.has_serial_no)),
                      'row-reloaded': isItemReloaded(line.item_code)
                    }"
                  >
                    <td class="text-center row-index">{{ idx + 1 }}</td>
                    <td>
                      <div class="frappe-item-code">{{ line.item_code }}</div>
                      <div class="frappe-item-name">{{ line.item_name }}</div>

                      <!-- Under item error -->
                      <div v-if="getItemError(line)" class="frappe-item-error">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <span>{{ getItemError(line) }}</span>
                      </div>
                    </td>
                    <td class="text-right readonly-cell bold-text">
                      {{ line.qty }} <span class="uom-text">{{ line.uom || line.stock_uom || '' }}</span>
                      <div v-if="line.stock_uom && line.uom && line.stock_uom !== line.uom" class="frappe-sub-stock-qty" title="Inventory Stock Qty">
                        ({{ getStockQty(line) }} {{ line.stock_uom }})
                      </div>
                    </td>
                    <td class="text-right readonly-cell">{{ formatCurrency(line.rate) }}</td>
                    <td class="text-right readonly-cell bold-text">{{ formatCurrency(line.qty * line.rate) }}</td>
                    <td>
                      <div class="frappe-bs-cell">
                        <!-- Realtime Item Auto Assign Button & Required Stock Badge -->
                        <div
                          class="frappe-bs-head"
                          v-if="line.has_batch_no || line.has_serial_no || line.batch_no !== undefined || line.serial_no !== undefined"
                        >
                          <div class="frappe-bs-stock-badge" title="Required Total Stock Quantity">
                            Req Stock: <strong>{{ getStockQty(line) }} {{ line.stock_uom || line.uom || '' }}</strong>
                          </div>
                          <button
                            class="frappe-link-btn"
                            :class="{ 'btn-reloading': refreshingItemCode === line.item_code }"
                            @click="autoAssignItem(line)"
                            :disabled="isRefreshingStock || refreshingItemCode === line.item_code"
                            title="Fetch server stock & auto-assign batch/serial for this item"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2.5"
                              width="12"
                              height="12"
                              :class="{ 'frappe-spin-icon': refreshingItemCode === line.item_code }"
                            >
                              <path d="M23 4v6h-6M1 20v-6h6"/>
                              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                            </svg>
                            <span>{{ refreshingItemCode === line.item_code ? 'Reloading…' : 'Auto Assign' }}</span>
                          </button>
                        </div>

                        <!-- Batch Dropdown -->
                        <div v-if="line.has_batch_no || line.batch_no !== undefined" class="frappe-field">
                          <label class="frappe-field-label">Batch No</label>
                          <select
                            v-model="line.batch_no"
                            class="frappe-select"
                            :class="{ 'control-reloaded': isItemReloaded(line.item_code) }"
                          >
                            <option value="">Select Batch...</option>
                            <option
                              v-for="b in getAvailableBatchesForItem(line.item_code)"
                              :key="b.batch_no"
                              :value="b.batch_no"
                            >
                              {{ b.batch_no }} (Available: {{ b.qty }})
                            </option>
                            <option v-if="line.batch_no && !getAvailableBatchesForItem(line.item_code).some((b: any) => b.batch_no === line.batch_no)" :value="line.batch_no">
                              {{ line.batch_no }} (Currently Assigned)
                            </option>
                          </select>
                        </div>

                        <!-- Serial Dropdown & Tags -->
                        <div v-if="line.has_serial_no || line.serial_no !== undefined" class="frappe-field">
                          <label class="frappe-field-label">Serial No(s) (Required: {{ getStockQty(line) }} {{ line.stock_uom || '' }})</label>
                          
                          <!-- Serial Pills -->
                          <div class="frappe-pills-wrap" v-if="getLineSerialsArray(line).length > 0">
                            <span v-for="s in getLineSerialsArray(line)" :key="s" class="frappe-pill">
                              {{ s }}
                              <button class="frappe-pill-close" @click="removeSerialFromLine(line, s)" title="Remove">×</button>
                            </span>
                          </div>

                          <!-- Serial Select Picker -->
                          <select
                            @change="onSerialSelectChange(line, $event)"
                            class="frappe-select"
                            :class="{ 'control-reloaded': isItemReloaded(line.item_code) }"
                          >
                            <option value="">+ Add Serial ({{ getAvailableSerialsForItem(line.item_code, line.batch_no).length }} available)</option>
                            <option
                              v-for="s in getAvailableSerialsForItem(line.item_code, line.batch_no)"
                              :key="s.serial_no"
                              :value="s.serial_no"
                              :disabled="getLineSerialsArray(line).includes(s.serial_no)"
                            >
                              {{ s.serial_no }} {{ s.batch_no ? `(${s.batch_no})` : '' }}
                            </option>
                          </select>
                        </div>

                        <span v-if="!line.has_batch_no && !line.has_serial_no && !line.batch_no && !line.serial_no" class="frappe-muted">
                          Standard Item
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Section: Payments & Totals -->
          <div class="frappe-totals-section">
            <!-- Payments Breakdown -->
            <div class="frappe-payments-col" v-if="editedPayments.length > 0">
              <div class="frappe-section-label">Payment Breakup</div>
              <table class="frappe-payments-table">
                <tbody>
                  <tr v-for="(pay, pidx) in editedPayments" :key="pidx">
                    <td class="pay-mode">{{ pay.mode_of_payment }}</td>
                    <td class="text-right bold-text">{{ formatCurrency(pay.amount) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Grand Total Block -->
            <div class="frappe-summary-col">
              <div class="frappe-summary-row">
                <span class="summary-label">Total Quantity</span>
                <span class="summary-val">{{ totalQty }}</span>
              </div>
              <div class="frappe-summary-row grand-total-row">
                <span class="summary-label">Grand Total</span>
                <span class="summary-val">{{ formatCurrency(calculatedGrandTotal) }}</span>
              </div>
            </div>
          </div>

          <!-- Realtime Toast Banner -->
          <Transition name="frappe-toast-fade">
            <div v-if="saveSuccessMsg" class="frappe-toast">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>{{ saveSuccessMsg }}</span>
            </div>
          </Transition>
        </div>

        <!-- ERPNext Modal Footer -->
        <div class="frappe-modal-footer">
          <button class="frappe-btn frappe-btn-default" @click="closeModal">
            Close
          </button>
          <button class="frappe-btn frappe-btn-primary" @click="saveChanges" :disabled="isSaving">
            <span v-if="isSaving" class="frappe-spin"></span>
            {{ isSaving ? 'Saving…' : 'Save & Update Queue' }}
          </button>
        </div>

      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { updateSyncItemPayload } from '../../db/posDB';
import { useSyncStore } from '../../stores/syncStore';
import { usePOSStore } from '../../stores/posStore';
import { useNetworkStore } from '../../stores/networkStore';
import { formatCurrency as globalFormatCurrency } from '../../lib/currency';

const props = defineProps<{
  isOpen: boolean;
  item: any;
  errorMessage?: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated'): void;
}>();

const sync = useSyncStore();
const pos = usePOSStore();
const network = useNetworkStore();

const isSaving = ref(false);
const saveSuccessMsg = ref<string | null>(null);

const isRefreshingStock = ref(false);
const refreshingItemCode = ref<string | null>(null);
const reloadedItemsMap = ref<Record<string, boolean>>({});

function getStockQty(line: any): number {
  if (!line) return 0;
  if (line.stock_qty !== undefined && line.stock_qty !== null && line.stock_qty !== 0) {
    return Number(line.stock_qty);
  }
  const factor = Number(line.conversion_factor) || 1;
  return (Number(line.qty) || 0) * factor;
}

// Editable copy of items & payments & customer
const editedItems = ref<any[]>([]);
const editedPayments = ref<any[]>([]);
const editedCustomer = ref<string>('');
const isRefreshingCustomers = ref<boolean>(false);
const customerSearchQuery = ref<string>('');
const isCustomerDropdownOpen = ref<boolean>(false);
const customerSearchInputRef = ref<HTMLInputElement | null>(null);

function toggleCustomerPicker() {
  isCustomerDropdownOpen.value = !isCustomerDropdownOpen.value;
  if (isCustomerDropdownOpen.value) {
    setTimeout(() => {
      customerSearchInputRef.value?.focus();
    }, 50);
  }
}

function selectCustomer(custName: string) {
  editedCustomer.value = custName;
  isCustomerDropdownOpen.value = false;
}

const selectedCustomerLabel = computed(() => {
  if (!editedCustomer.value) return '-- Select Customer --';
  const found = pos.customers.find((c: any) => c.name === editedCustomer.value);
  if (found) {
    return `${found.customer_name} (${found.name})${found.mobile_no ? ` - 📞 ${found.mobile_no}` : ''}`;
  }
  return editedCustomer.value;
});

const filteredCustomers = computed(() => {
  const list = pos.customers || [];
  const q = customerSearchQuery.value.trim().toLowerCase();
  if (!q) return list;
  const filtered = list.filter((c: any) =>
    (c.customer_name || '').toLowerCase().includes(q) ||
    (c.name || '').toLowerCase().includes(q) ||
    (c.mobile_no || '').toLowerCase().includes(q) ||
    (c.email_id || '').toLowerCase().includes(q)
  );
  if (editedCustomer.value && !filtered.some((c: any) => c.name === editedCustomer.value)) {
    const selectedObj = list.find((c: any) => c.name === editedCustomer.value);
    if (selectedObj) filtered.unshift(selectedObj);
  }
  return filtered;
});

async function refreshCustomersFromServer() {
  isRefreshingCustomers.value = true;
  saveSuccessMsg.value = null;
  try {
    saveSuccessMsg.value = 'Fetching latest customer list from ERPNext server…';
    await pos.prefetchAllCustomers();
    await pos.loadCustomers();
    saveSuccessMsg.value = `✓ Fresh customer list updated from server! (${pos.customers.length} customers in IndexedDB)`;
    setTimeout(() => { saveSuccessMsg.value = null; }, 3500);
  } catch (err: any) {
    alert('Failed to refresh customer list: ' + (err?.message || 'Unknown error'));
  } finally {
    isRefreshingCustomers.value = false;
  }
}

const invoiceDoc = computed(() => {
  if (!props.item) return null;
  return props.item.payload?.invoice || props.item.payload?.doc || props.item.payload;
});

const isBlocked = computed(() => {
  return (
    props.item?.action === 'submit_invoice' &&
    (invoiceDoc.value?.customer || '').startsWith('OFFLINE-')
  );
});

const formattedDate = computed(() => {
  const d = invoiceDoc.value?.posting_date || props.item?.created_at;
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
});

const formattedTime = computed(() => {
  const t = invoiceDoc.value?.posting_time;
  if (t) return t;
  const c = props.item?.created_at;
  if (!c) return '';
  return new Date(c).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
});

const calculatedGrandTotal = computed(() => {
  if (!editedItems.value.length) return invoiceDoc.value?.grand_total || 0;
  return editedItems.value.reduce((sum, item) => sum + (item.qty * item.rate || 0), 0);
});

const totalQty = computed(() => {
  return editedItems.value.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
});

function formatCurrency(amount: number): string {
  return globalFormatCurrency(amount || 0, pos.session?.currency);
}

function getItemError(line: any): string | null {
  if (!props.errorMessage) return null;
  const err = props.errorMessage;
  const errLower = err.toLowerCase();
  const code = (line.item_code || '').toLowerCase();
  const name = (line.item_name || '').toLowerCase();
  const batch = (line.batch_no || '').toLowerCase();
  const serial = (line.serial_no || '').toLowerCase();

  if (
    (code && errLower.includes(code)) ||
    (name && errLower.includes(name)) ||
    (batch && errLower.includes(batch)) ||
    (serial && errLower.includes(serial))
  ) {
    return err;
  }

  if (
    (line.has_batch_no || line.has_serial_no || line.batch_no || line.serial_no) &&
    (errLower.includes('batch') || errLower.includes('serial') || errLower.includes('stock') || errLower.includes('sold') || errLower.includes('not available'))
  ) {
    return err;
  }

  return null;
}

function isItemReloaded(itemCode: string): boolean {
  return !!reloadedItemsMap.value[itemCode];
}

function triggerRowReloadAnimation(itemCodes: string[]) {
  const map = { ...reloadedItemsMap.value };
  itemCodes.forEach((code) => {
    map[code] = true;
  });
  reloadedItemsMap.value = map;

  setTimeout(() => {
    const updated = { ...reloadedItemsMap.value };
    itemCodes.forEach((code) => {
      delete updated[code];
    });
    reloadedItemsMap.value = updated;
  }, 1800);
}

function getAvailableBatchesForItem(itemCode: string) {
  if (!itemCode) return [];
  const pool = pos.getAvailableStockPool(itemCode);
  return pool.batches.filter((b: any) => b.qty > 0);
}

function getAvailableSerialsForItem(itemCode: string, targetBatchNo?: string) {
  if (!itemCode) return [];
  const pool = pos.getAvailableStockPool(itemCode);
  let serials = pool.serials;
  if (targetBatchNo && targetBatchNo.trim()) {
    const bTrim = targetBatchNo.trim();
    serials = serials.filter((s: any) => !s.batch_no || s.batch_no === bTrim);
  }
  return serials;
}

function getLineSerialsArray(line: any): string[] {
  if (!line.serial_no) return [];
  return String(line.serial_no)
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function addSerialToLine(line: any, serialNo: string) {
  if (!serialNo || !serialNo.trim()) return;
  const current = getLineSerialsArray(line);
  const cleanSerial = serialNo.trim();
  if (!current.includes(cleanSerial)) {
    current.push(cleanSerial);
    line.serial_no = current.join(', ');
  }
}

function removeSerialFromLine(line: any, serialNo: string) {
  const current = getLineSerialsArray(line);
  const filtered = current.filter((s) => s !== serialNo);
  line.serial_no = filtered.join(', ');
}

function onSerialSelectChange(line: any, event: Event) {
  const selectEl = event.target as HTMLSelectElement;
  const val = selectEl.value;
  if (val) {
    addSerialToLine(line, val);
    selectEl.value = '';
  }
}

async function autoAssignItem(line: any) {
  if (!line.item_code) return;
  refreshingItemCode.value = line.item_code;
  saveSuccessMsg.value = null;

  try {
    if (network.isOnline) {
      saveSuccessMsg.value = `Fetching latest stock from server for ${line.item_code}…`;
      await pos.refreshItemSerialBatchDataFromServer(line.item_code);
    }

    if (!Object.keys(pos.serialBatchMap || {}).length) {
      await pos.loadMasterData();
    }

    const allocs = pos.autoSelectSerialsAndBatches(line.item_code, getStockQty(line));
    if (allocs && allocs.length > 0) {
      const batches = Array.from(new Set(allocs.map((a: any) => a.batch_no).filter(Boolean)));
      if (batches.length > 0) {
        line.batch_no = batches.join(', ');
      }

      const serials = allocs.map((a: any) => a.serial_no).filter(Boolean);
      if (serials.length > 0) {
        line.serial_no = serials.join(', ');
      }

      triggerRowReloadAnimation([line.item_code]);
      saveSuccessMsg.value = `Real-time updated server stock & auto-assigned Batch/Serial for ${line.item_code}!`;
      setTimeout(() => { saveSuccessMsg.value = null; }, 3500);
    } else {
      alert(`No available unsold batch/serial stock found for item ${line.item_code} on server or local database.`);
    }
  } catch (e: any) {
    alert('Failed to auto-assign: ' + (e?.message || 'Unknown error'));
  } finally {
    refreshingItemCode.value = null;
  }
}

async function autoAssignAll() {
  isRefreshingStock.value = true;
  saveSuccessMsg.value = null;

  try {
    if (network.isOnline) {
      saveSuccessMsg.value = 'Fetching latest batch & serial stock for all items from server in real-time…';
      await pos.refreshSerialBatchDataFromServer();
    }

    if (!Object.keys(pos.serialBatchMap || {}).length) {
      await pos.loadMasterData();
    }

    let assignedCount = 0;
    const updatedCodes: string[] = [];
    for (const line of editedItems.value) {
      if (line.has_batch_no || line.has_serial_no || line.batch_no !== undefined || line.serial_no !== undefined) {
        const allocs = pos.autoSelectSerialsAndBatches(line.item_code, getStockQty(line));
        if (allocs && allocs.length > 0) {
          const batches = Array.from(new Set(allocs.map((a: any) => a.batch_no).filter(Boolean)));
          if (batches.length > 0) line.batch_no = batches.join(', ');

          const serials = allocs.map((a: any) => a.serial_no).filter(Boolean);
          if (serials.length > 0) line.serial_no = serials.join(', ');

          assignedCount++;
          updatedCodes.push(line.item_code);
        }
      }
    }

    if (assignedCount > 0) {
      triggerRowReloadAnimation(updatedCodes);
      saveSuccessMsg.value = `Real-time reloaded server stock & auto-assigned Batch & Serial for ${assignedCount} item(s)!`;
      setTimeout(() => { saveSuccessMsg.value = null; }, 4000);
    } else {
      alert('No available unsold batch/serial stock found on server or local database for these items.');
    }
  } catch (e: any) {
    alert('Failed to auto assign: ' + (e?.message || 'Unknown error'));
  } finally {
    isRefreshingStock.value = false;
  }
}

watch(
  () => props.item,
  (newItem) => {
    if (newItem) {
      const doc = newItem.payload?.invoice || newItem.payload?.doc || newItem.payload;
      const rawItems = doc?.items || [];
      editedItems.value = rawItems.map((i: any) => ({
        ...i,
        batch_no: i.batch_no || '',
        serial_no: i.serial_no || '',
      }));
      editedPayments.value = (doc?.payments || []).map((p: any) => ({ ...p }));
      editedCustomer.value = doc?.customer || '';
      saveSuccessMsg.value = null;

      if (!pos.customers || !pos.customers.length) {
        pos.loadCustomers();
      }

      if (!Object.keys(pos.serialBatchMap || {}).length) {
        pos.loadMasterData();
      }
    } else {
      editedItems.value = [];
      editedPayments.value = [];
      editedCustomer.value = '';
    }
  },
  { immediate: true }
);

function closeModal() {
  emit('close');
}

async function saveChanges() {
  if (!props.item?.id) return;
  isSaving.value = true;
  saveSuccessMsg.value = null;

  try {
    const payload = JSON.parse(JSON.stringify(props.item.payload));
    const targetDoc = payload.invoice || payload.doc || payload;

    if (editedCustomer.value && editedCustomer.value.trim()) {
      const cName = editedCustomer.value.trim();
      targetDoc.customer = cName;
      const foundCust = pos.customers.find((c: any) => c.name === cName);
      if (foundCust && foundCust.customer_name) {
        targetDoc.customer_name = foundCust.customer_name;
      }
    }

    targetDoc.items = editedItems.value.map((i: any) => {
      const itemObj: any = { ...i };
      if (i.batch_no && i.batch_no.trim()) {
        itemObj.batch_no = i.batch_no.trim();
        itemObj.use_serial_batch_fields = 1;
      } else {
        delete itemObj.batch_no;
      }
      if (i.serial_no && i.serial_no.trim()) {
        itemObj.serial_no = i.serial_no.trim();
        itemObj.use_serial_batch_fields = 1;
      } else {
        delete itemObj.serial_no;
      }
      return itemObj;
    });

    targetDoc.grand_total = calculatedGrandTotal.value;

    await updateSyncItemPayload(props.item.id, payload);
    sync.clearFailedItem(props.item.id);

    emit('updated');
    closeModal();
  } catch (err: any) {
    alert('Failed to save changes: ' + (err?.message || 'Unknown error'));
  } finally {
    isSaving.value = false;
  }
}
</script>

<style scoped>
/* ── Frappe ERPNext Desk Form Styling ───────────────────────────── */

.frappe-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
  z-index: 9000;
}
.frappe-modal-fade-enter-active, .frappe-modal-fade-leave-active { transition: opacity 0.15s ease; }
.frappe-modal-fade-enter-from, .frappe-modal-fade-leave-to { opacity: 0; }

.frappe-modal-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 880px;
  max-width: 95vw;
  max-height: 92vh;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  z-index: 9001;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #d1d8dd;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1f272e;
}
.frappe-modal-scale-enter-active, .frappe-modal-scale-leave-active { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.frappe-modal-scale-enter-from, .frappe-modal-scale-leave-to { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }

/* Header */
.frappe-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
}
.frappe-title-area {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.frappe-doctype-tag {
  font-size: 11px;
  font-weight: 500;
  color: #8d99a6;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.frappe-doc-name {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
  color: #1f272e;
}
.frappe-header-meta {
  display: flex;
  align-items: center;
  gap: 14px;
}
.frappe-close-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: #8d99a6;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s;
}
.frappe-close-btn:hover {
  background: #f4f5f6;
  color: #1f272e;
}

/* Frappe Indicator Status Badges */
.frappe-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}
.frappe-indicator.red { background: #ffeef0; color: #e24c4c; }
.frappe-indicator.blue { background: #eef8ff; color: #2490ef; }
.frappe-indicator.orange { background: #fff8e7; color: #ecad00; }

.frappe-indicator-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}
.frappe-indicator-dot.red { background: #e24c4c; }
.frappe-indicator-dot.blue { background: #2490ef; }
.frappe-indicator-dot.orange { background: #ecad00; }

/* Alert Box */
.frappe-alert-danger {
  background: #fff5f5;
  border-bottom: 1px solid #fed7d7;
  padding: 12px 20px;
  color: #c53030;
  font-size: 13px;
}
.frappe-alert-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  margin-bottom: 4px;
}
.frappe-alert-msg {
  margin: 0 0 6px 20px;
  line-height: 1.4;
}
.frappe-alert-tip {
  margin-left: 20px;
  font-size: 12px;
  color: #9b2c2c;
  background: rgba(255, 255, 255, 0.7);
  padding: 6px 10px;
  border-radius: 4px;
  border-left: 3px solid #e53e3e;
}

/* Body */
.frappe-modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: #ffffff;
}

/* Form Sections */
.frappe-form-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.frappe-section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #8d99a6;
  margin-bottom: 2px;
}
.frappe-section-head-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.frappe-details-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: #f8fafc;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.frappe-customer-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.frappe-customer-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

/* Control Grid (Field Columns) */
.frappe-control-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}
.frappe-control-label {
  font-size: 12px;
  color: #6c767e;
  margin-bottom: 3px;
}
.frappe-customer-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.frappe-customer-input-row .frappe-searchable-picker {
  flex: 1;
}
.frappe-searchable-picker {
  position: relative;
  width: 100%;
}
.picker-trigger-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 6px 12px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}
.picker-trigger-box:hover {
  border-color: #94a3b8;
}
.picker-trigger-box.active {
  border-color: #2490ef;
  box-shadow: 0 0 0 2px rgba(36, 144, 239, 0.15);
}
.picker-trigger-box.control-blocked {
  border-color: #f59e0b;
  background: #fffbe6;
}
.picker-selected-label {
  font-size: 13px;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker-chevron {
  color: #64748b;
  transition: transform 0.2s ease;
}
.picker-chevron.rotated {
  transform: rotate(180deg);
}

.picker-dropdown-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 100;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  max-height: 280px;
  overflow: hidden;
}
.picker-search-header {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px 10px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.picker-search-header .search-icon {
  position: absolute;
  left: 18px;
  color: #94a3b8;
  pointer-events: none;
}
.picker-search-input {
  width: 100%;
  height: 32px;
  padding: 0 28px 0 28px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 12px;
  color: #0f172a;
  background: #ffffff;
}
.picker-search-input:focus {
  outline: none;
  border-color: #2490ef;
}
.picker-options-list {
  overflow-y: auto;
  flex: 1;
  max-height: 210px;
  padding: 4px 0;
}
.picker-no-results {
  padding: 16px;
  font-size: 12px;
  color: #64748b;
  text-align: center;
  line-height: 1.5;
}
.picker-option-item {
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.1s ease;
}
.picker-option-item:hover {
  background: #f1f5f9;
}
.picker-option-item.selected {
  background: #eff6ff;
  border-left: 3px solid #2490ef;
}
.option-title {
  font-size: 13px;
  color: #0f172a;
}
.option-details {
  font-size: 11px;
  color: #64748b;
  margin-top: 1px;
}
.frappe-control-value {
  font-size: 13px;
  color: #1f272e;
}
.bold-text { font-weight: 600; }

/* Grid Table */
.frappe-grid-wrapper {
  border: 1px solid #d1d8dd;
  border-radius: 6px;
  overflow: hidden;
}
.frappe-grid-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.frappe-grid-table th {
  background: #f4f5f6;
  color: #525252;
  font-weight: 600;
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid #d1d8dd;
}

/* ── Realtime Reload & Row Flash Animations ───────────────────── */

.frappe-spin-icon {
  animation: frappe-spin-anim 0.65s linear infinite;
}
@keyframes frappe-spin-anim {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.btn-reloading {
  opacity: 0.85;
  pointer-events: none;
}

.frappe-grid-row {
  transition: background-color 0.4s ease, border-left-color 0.3s ease;
  border-left: 3px solid transparent;
}

.frappe-grid-row.row-reloading {
  background-color: rgba(36, 144, 239, 0.08) !important;
  border-left-color: #2490ef !important;
}

.frappe-grid-row.row-reloaded {
  animation: row-flash-success 1.6s ease-out;
}

@keyframes row-flash-success {
  0% {
    background-color: rgba(34, 197, 94, 0.22);
    border-left-color: #22c55e;
  }
  50% {
    background-color: rgba(34, 197, 94, 0.12);
  }
  100% {
    background-color: transparent;
    border-left-color: transparent;
  }
}

.frappe-grid-row td {
  padding: 10px 12px;
  border-bottom: 1px solid #edf2f7;
  vertical-align: top;
  color: #1f272e;
}
.frappe-grid-row:last-child td { border-bottom: none; }
.row-index { color: #8d99a6; }
.readonly-cell { background: #fafafa; }
.uom-text { color: #8d99a6; font-size: 11px; font-weight: normal; }

.frappe-item-code { font-weight: 600; color: #1f272e; }
.frappe-item-name { font-size: 11px; color: #6c767e; }

.frappe-item-error {
  margin-top: 6px;
  padding: 4px 8px;
  background: #fff5f5;
  border: 1px solid #fed7d7;
  border-radius: 4px;
  color: #c53030;
  font-size: 11px;
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.frappe-sub-stock-qty {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
  margin-top: 2px;
}

.frappe-bs-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.frappe-bs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.frappe-bs-stock-badge {
  font-size: 11px;
  color: #475569;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  white-space: nowrap;
}
.frappe-bs-stock-badge strong {
  color: #0f172a;
  font-weight: 700;
}
.frappe-link-btn {
  background: none;
  border: none;
  color: #2490ef;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}
.frappe-link-btn:hover:not(:disabled) { text-decoration: underline; color: #1a7bb9; }

.frappe-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.frappe-field-label {
  font-size: 11px;
  color: #6c767e;
}
.frappe-select {
  width: 100%;
  height: 30px;
  padding: 4px 8px;
  border: 1px solid #d1d8dd;
  border-radius: 4px;
  font-size: 12px;
  color: #1f272e;
  background: #ffffff;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.frappe-select:focus {
  border-color: #2490ef;
  outline: none;
  box-shadow: 0 0 0 2px rgba(36, 144, 239, 0.15);
}
.control-reloaded {
  border-color: #22c55e !important;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2) !important;
}

/* Serial Pills */
.frappe-pills-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 2px;
}
.frappe-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  background: #eef8ff;
  color: #2490ef;
  border: 1px solid #d0e7ff;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}
.frappe-pill-close {
  background: none;
  border: none;
  color: #2490ef;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}
.frappe-pill-close:hover { color: #e24c4c; }
.frappe-muted { font-size: 11px; color: #8d99a6; }

/* Totals & Payments Section */
.frappe-totals-section {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  margin-top: 4px;
}
.frappe-payments-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.frappe-payments-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #d1d8dd;
  border-radius: 6px;
  overflow: hidden;
  font-size: 12px;
}
.frappe-payments-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #edf2f7;
}
.pay-mode { color: #1f272e; }

.frappe-summary-col {
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px 16px;
}
.frappe-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #6c767e;
}
.grand-total-row {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid #e2e8f0;
  font-size: 14px;
  font-weight: 700;
  color: #1f272e;
}

/* Toast Banner */
.frappe-toast {
  background: #1f272e;
  color: #ffffff;
  padding: 8px 14px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.frappe-toast-fade-enter-active, .frappe-toast-fade-leave-active { transition: all 0.2s ease; }
.frappe-toast-fade-enter-from, .frappe-toast-fade-leave-to { opacity: 0; transform: translateY(6px); }

/* Footer */
.frappe-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
}

/* Buttons (ERPNext Frappe Desk Style) */
.frappe-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 14px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}
.frappe-btn-xs {
  height: 26px;
  padding: 0 10px;
  font-size: 11px;
}
.frappe-btn-default {
  background: #f0f4f8;
  border-color: #d1d8dd;
  color: #36414c;
}
.frappe-btn-default:hover:not(:disabled) {
  background: #e2e8f0;
  color: #1f272e;
}
.frappe-btn-primary {
  background: #2490ef;
  border-color: #2490ef;
  color: #ffffff;
}
.frappe-btn-primary:hover:not(:disabled) {
  background: #1a7bb9;
  border-color: #1a7bb9;
}
.frappe-btn-primary-ghost {
  background: rgba(36, 144, 239, 0.08);
  border-color: rgba(36, 144, 239, 0.25);
  color: #2490ef;
}
.frappe-btn-primary-ghost:hover:not(:disabled) {
  background: #2490ef;
  color: #ffffff;
  border-color: #2490ef;
}
.frappe-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Spinner */
.frappe-spin {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: frappe-rot 0.6s linear infinite;
  display: inline-block;
}
@keyframes frappe-rot { to { transform: rotate(360deg); } }

.text-center { text-align: center; }
.text-right { text-align: right; }
</style>

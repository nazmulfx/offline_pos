<!--
  ItemDetails.vue — Middle panel: detailed item configurations
-->
<template>
  <div class="item-details" v-if="item">
    <!-- Header -->
    <div class="item-details__header">
      <h3 class="item-details__title">Item Details</h3>
      <button class="item-details__close" @click="pos.selectCartItem(null)" title="Close details">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="item-details__content">
      <!-- Summary: Name, price, image -->
      <div class="item-details__summary">
        <div class="item-details__summary-left">
          <h2 class="item-details__name">{{ item.item_name }}</h2>
          <div class="item-details__price">{{ formatCurrency(item.amount) }}</div>
        </div>
        <div class="item-details__summary-right">
          <div class="item-details__img-wrap">
            <img
              v-if="!hideImages && posItem?.item_image && !imgError"
              :src="posItem.item_image"
              :alt="item.item_name"
              class="item-details__img"
              @error="imgError = true"
            />
            <div v-else class="item-details__img-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36">
                <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
                <path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Grid of Fields -->
      <div class="item-details__grid">
        <!-- Quantity -->
        <div class="item-details__field">
          <label class="item-details__label">Quantity</label>
          <input
            type="number"
            :value="item.qty"
            @input="handleQtyInput"
            @focus="activeField = 'qty'"
            class="item-details__input"
            :class="{ 'item-details__input--active': activeField === 'qty' }"
            step="0.001"
            min="0"
          />
        </div>

        <!-- UOM -->
        <div class="item-details__field">
          <label class="item-details__label">UOM <span class="required">*</span></label>
          <select
            :value="item.uom"
            @change="onUOMChanged(($event.target as HTMLSelectElement).value)"
            class="item-details__select"
          >
            <option v-for="u in availableUoms" :key="u" :value="u">
              {{ u }}
            </option>
          </select>
        </div>

        <!-- Rate -->
        <div class="item-details__field">
          <label class="item-details__label">Rate <span class="required">*</span></label>
          <div class="item-details__input-wrap">
            <span class="item-details__currency-symbol">{{ currencySymbol }}</span>
            <input
              type="number"
              :value="item.rate"
              :disabled="pos.session?.allow_rate_change !== 1"
              :readonly="pos.session?.allow_rate_change !== 1"
              @input="pos.updateRate(item.item_code, parseFloat(($event.target as HTMLInputElement).value) || 0, item.batch_no)"
              @focus="pos.session?.allow_rate_change === 1 ? activeField = 'rate' : null"
              class="item-details__input item-details__input--currency"
              :class="{ 'item-details__input--active': activeField === 'rate', 'disabled': pos.session?.allow_rate_change !== 1 }"
              step="0.01"
              min="0"
            />
          </div>
        </div>

        <!-- UOM Conversion Factor -->
        <div class="item-details__field">
          <label class="item-details__label">UOM Conversion Factor <span class="required">*</span></label>
          <input
            type="number"
            :value="item.conversion_factor ?? 1"
            readonly
            class="item-details__input disabled"
          />
        </div>

        <!-- Discount (%) -->
        <div class="item-details__field">
          <label class="item-details__label">Discount (%)</label>
          <input
            type="number"
            :value="parseFloat((item.discount_percentage || 0).toFixed(2))"
            :disabled="pos.session?.allow_discount_change !== 1"
            :readonly="pos.session?.allow_discount_change !== 1"
            @input="pos.updateDiscount(item.item_code, parseFloat(($event.target as HTMLInputElement).value) || 0, item.batch_no)"
            @focus="pos.session?.allow_discount_change === 1 ? activeField = 'discount' : null"
            class="item-details__input"
            :class="{ 'item-details__input--active': activeField === 'discount', 'disabled': pos.session?.allow_discount_change !== 1 }"
            step="0.01"
            min="0"
            max="100"
          />
        </div>

        <!-- Warehouse -->
        <div class="item-details__field">
          <label class="item-details__label">Warehouse</label>
          <input
            type="text"
            :value="item.warehouse"
            disabled
            class="item-details__input disabled"
          />
        </div>

        <!-- Qty (Warehouse) -->
        <div class="item-details__field">
          <label class="item-details__label">Qty (Warehouse)</label>
          <input
            type="text"
            :value="posItem?.actual_qty ?? 0"
            disabled
            class="item-details__input disabled"
          />
        </div>

        <!-- Batch Number (Readonly, shown if enabled for item) -->
        <div v-if="item.has_batch_no" class="item-details__field">
          <label class="item-details__label">Batch Number</label>
          <input
            type="text"
            :value="item.batch_no || 'None'"
            disabled
            class="item-details__input disabled"
          />
        </div>

        <!-- Serial Numbers (Readonly, shown if enabled for item) -->
        <div v-if="item.has_serial_no" class="item-details__field item-details__field--full">
          <label class="item-details__label">Serial Numbers</label>
          <textarea
            :value="item.serial_no || 'None'"
            disabled
            rows="3"
            class="item-details__input disabled"
            style="resize: none; font-family: monospace; font-size: 12px; line-height: 1.4; background: var(--pos-bg);"
          ></textarea>
        </div>

        <!-- Allocations breakdown (Readonly, shown when multiple allocations exist) -->
        <div v-if="item.allocations && item.allocations.length > 0" class="item-details__field item-details__field--full">
          <label class="item-details__label">Allocated Batches & Serials</label>
          <div class="item-details__allocations-list">
            <div v-for="(alloc, idx) in item.allocations" :key="idx" class="item-details__alloc-card">
              <div class="item-details__alloc-header">
                <span class="item-details__alloc-batch" v-if="alloc.batch_no">
                  <svg class="item-details__alloc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="margin-right: 4px; display: inline-block; vertical-align: middle;">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  </svg>
                  {{ alloc.batch_no }}
                </span>
                <span class="item-details__alloc-batch-placeholder" v-else>Serial Allocation</span>
                <span class="item-details__alloc-qty">Qty: {{ alloc.qty }}</span>
              </div>
              <div class="item-details__alloc-serials" v-if="alloc.serial_no">
                <div class="item-details__alloc-serial-badge" v-for="sn in alloc.serial_no.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)" :key="sn">
                  {{ sn }}
                </div>
              </div>
            </div>
          </div>
        </div>



        <!-- Price List Rate -->
        <div class="item-details__field">
          <label class="item-details__label">Price List Rate</label>
          <div class="item-details__input-wrap">
            <span class="item-details__currency-symbol">{{ currencySymbol }}</span>
            <input
              type="text"
              :value="item.price_list_rate ?? item.rate"
              disabled
              class="item-details__input item-details__input--currency disabled"
            />
          </div>
        </div>
      </div>

      <!-- Number Pad Section -->
      <div class="item-details__numpad">
        <NumberPad
          hide-header
          hide-modes
          :initial-mode="activeField || 'qty'"
          :value="activeFieldValue"
          :key="`${pos.selectedItemIdx}-${activeField}`"
          @update="onNumpadUpdate"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePOSStore } from '../../stores/posStore';
import NumberPad from './NumberPad.vue';
import { formatCurrency as globalFormatCurrency, getCurrencySymbol } from '../../lib/currency';

const pos = usePOSStore();
const item = computed(() => pos.selectedCartItem);
const imgError = ref(false);
const activeField = ref<'qty' | 'rate' | 'discount' | null>('qty');
const uomConversionFactors = ref<Array<{ uom: string; conversion_factor: number }>>([]);
const uomPrices = ref<Record<string, number>>({});
const numpadKey = ref(0);

const activeFieldValue = computed(() => {
  if (!item.value) return 0;
  if (activeField.value === 'qty') return item.value.qty;
  if (activeField.value === 'rate') return item.value.rate;
  if (activeField.value === 'discount') return item.value.discount_percentage || 0;
  return 0;
});

watch(
  () => item.value?.item_code,
  async (newCode) => {
    if (newCode) {
      activeField.value = 'qty';
      const data = await pos.fetchItemDetailsOfflineData(newCode);
      uomConversionFactors.value = data.uoms;
      uomPrices.value = data.prices;
    } else {
      activeField.value = null;
      uomConversionFactors.value = [];
      uomPrices.value = {};
    }
  },
  { immediate: true }
);

const posItem = computed(() => {
  if (!item.value) return null;
  return pos.items.find((i) => i.item_code === item.value?.item_code) || null;
});

const hideImages = computed(() => !!pos.session?.hide_images);

const currencySymbol = computed(() => {
  return getCurrencySymbol(pos.session?.currency);
});

const availableUoms = computed(() => {
  const list = new Set<string>();
  if (item.value?.uom) list.add(item.value.uom);
  if (posItem.value?.stock_uom) list.add(posItem.value.stock_uom);
  if (posItem.value?.sales_uom) list.add(posItem.value.sales_uom);
  uomConversionFactors.value.forEach((row) => {
    if (row.uom) list.add(row.uom);
  });
  return Array.from(list);
});

async function onUOMChanged(newUom: string) {
  if (!item.value) return;
  let factor = 1;
  const match = uomConversionFactors.value.find((f) => f.uom === newUom);
  if (match) {
    factor = match.conversion_factor || 1;
  } else if (newUom === posItem.value?.stock_uom) {
    factor = 1;
  }

  const originalUom = item.value.uom;
  const success = await pos.updateCartItemConversionFactor(item.value.item_code, factor, item.value.batch_no);
  if (!success) {
    const selectEl = document.querySelector('.item-details__select') as HTMLSelectElement;
    if (selectEl) {
      selectEl.value = originalUom;
    }
    return;
  }

  let newPriceListRate = 0;
  if (uomPrices.value[newUom] !== undefined) {
    newPriceListRate = uomPrices.value[newUom];
  } else {
    const baseRate = posItem.value?.price_list_rate || 0;
    newPriceListRate = baseRate ? baseRate * factor : (item.value.price_list_rate || item.value.rate);
  }

  pos.updateCartItemUOM(item.value.item_code, newUom, item.value.batch_no);
  pos.updateCartItemPrice(item.value.item_code, newPriceListRate, item.value.batch_no);
}

function formatCurrency(value: number | undefined): string {
  return globalFormatCurrency(value, pos.session?.currency);
}

async function handleQtyInput(e: Event) {
  if (!item.value) return;
  const inputEl = e.target as HTMLInputElement;
  const targetVal = parseFloat(inputEl.value) || 0;
  const success = await pos.updateQty(item.value.item_code, targetVal, item.value.batch_no);
  if (!success) {
    inputEl.value = String(item.value.qty);
    numpadKey.value++;
  }
}

async function onNumpadUpdate(mode: string, value: string) {
  if (!item.value) return;
  const n = parseFloat(value) || 0;
  if (mode === 'qty') {
    const success = await pos.updateQty(item.value.item_code, n, item.value.batch_no);
    if (!success) {
      numpadKey.value++;
    }
  } else if (mode === 'rate') {
    if (pos.session?.allow_rate_change === 1) {
      pos.updateRate(item.value.item_code, n, item.value.batch_no);
    }
  } else if (mode === 'discount') {
    if (pos.session?.allow_discount_change === 1) {
      pos.updateDiscount(item.value.item_code, n, item.value.batch_no);
    }
  }
}
</script>

<style scoped>
.item-details {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--pos-surface);
  border-left: 1px solid var(--pos-border);
  overflow: hidden;
}

.item-details__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--pos-border);
  flex-shrink: 0;
}

.item-details__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--pos-text);
}

.item-details__close {
  background: none;
  border: 1px solid var(--pos-border);
  border-radius: 6px;
  padding: 4px 6px;
  color: var(--pos-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.12s;
}

.item-details__close:hover {
  color: var(--pos-text);
  background: var(--pos-bg);
  border-color: var(--pos-text-muted);
}

.item-details__content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.item-details__summary {
  display: flex;
  gap: 16px;
  justify-content: space-between;
  align-items: flex-start;
}

.item-details__summary-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-details__name {
  font-size: 18px;
  font-weight: 700;
  color: var(--pos-text);
  line-height: 1.3;
  margin: 0;
  word-break: break-word;
}

.item-details__price {
  font-size: 16px;
  font-weight: 800;
  color: var(--pos-accent);
}

.item-details__summary-right {
  flex-shrink: 0;
}

.item-details__img-wrap {
  width: 90px;
  height: 90px;
  border-radius: 12px;
  background: var(--pos-bg);
  border: 1px solid var(--pos-border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.item-details__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 6px;
}

.item-details__img-placeholder {
  color: var(--pos-text-muted);
  opacity: 0.4;
}

.item-details__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.item-details__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-details__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--pos-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.required {
  color: var(--pos-danger, #ef4444);
}

.item-details__input,
.item-details__select {
  width: 100%;
  background: var(--pos-bg);
  border: 1px solid var(--pos-border);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--pos-text);
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}

.item-details__input:focus,
.item-details__select:focus {
  border-color: var(--pos-accent);
  background: var(--pos-surface);
}

.item-details__input.disabled,
.item-details__input:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  background: var(--pos-bg);
}

.item-details__input--active {
  border-color: var(--pos-accent) !important;
  background: var(--pos-surface) !important;
  box-shadow: 0 0 0 2px rgba(99,102,241,0.2);
}

.item-details__input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.item-details__currency-symbol {
  position: absolute;
  left: 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--pos-text-muted);
  pointer-events: none;
}

.item-details__input--currency {
  padding-left: 44px;
}

.item-details__numpad {
  margin-top: 10px;
}

.item-details__allocations-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item-details__alloc-card {
  background: var(--pos-bg);
  border: 1px solid var(--pos-border);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item-details__alloc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
}
.item-details__alloc-batch {
  color: var(--pos-accent);
  display: flex;
  align-items: center;
  gap: 4px;
}
.item-details__alloc-batch-placeholder {
  color: var(--pos-text-muted);
}
.item-details__alloc-qty {
  color: var(--pos-text);
  background: var(--pos-border);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.item-details__alloc-serials {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-top: 1px dashed var(--pos-border);
  padding-top: 8px;
}
.item-details__alloc-serial-badge {
  background: var(--pos-accent-light, rgba(99,102,241,0.06));
  color: var(--pos-accent);
  border: 1px solid var(--pos-accent);
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: monospace;
}
</style>

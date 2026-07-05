<!--
  Cart.vue — Right panel: customer selector, cart items, totals, pay
-->
<template>
  <div class="cart">

    <!-- ── Header ──────────────────────────────── -->
    <div class="cart__head">
      <div class="cart__head-row">
        <div class="cart__title-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="cart__title-ico">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          <span class="cart__title">Cart</span>
          <span v-if="pos.cartCount > 0" class="cart__badge">{{ pos.cartCount }}</span>
        </div>
        <button v-if="pos.cartItems.length > 0" class="cart__trash" @click="showClearConfirm = true" title="Clear cart">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>

      <!-- Customer selector -->
      <CustomerSelector />
    </div>

    <!-- ── Items list ──────────────────────────── -->
    <div v-if="pos.cartItems.length > 0" class="cart__items">
      <CartItem
        v-for="(item, idx) in pos.cartItems"
        :key="`${item.item_code}-${item.batch_no}-${idx}`"
        :item="item"
        :is-active="pos.selectedItemIdx === idx"
        :currency="pos.session?.currency"
        @select="pos.selectCartItem(idx)"
        @remove="pos.removeFromCart(item.item_code, item.batch_no, item.uom)"
        @update-qty="(qty) => pos.updateQty(item.item_code, qty, item.batch_no, item.uom)"
      />
    </div>

    <!-- ── Empty state ─────────────────────────── -->
    <div v-else class="cart__empty">
      <div class="cart__empty-ico">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
      </div>
      <p class="cart__empty-text">Cart is empty</p>
      <span class="cart__empty-hint">Select items from the left</span>
    </div>


    <!-- ── Totals ──────────────────────────────── -->
    <div v-if="pos.cartItems.length > 0" class="cart__totals">
      <!-- Invoice-level Discount Fields -->
      <div class="cart__discount-inputs">
        <div class="cart__discount-input-field">
          <label class="cart__discount-label">Disc (%)</label>
          <input
            type="number"
            :value="pos.cartDiscount"
            :disabled="pos.session?.allow_discount_change !== 1"
            :readonly="pos.session?.allow_discount_change !== 1"
            @input="pos.setAdditionalDiscountPercent(parseFloat(($event.target as HTMLInputElement).value) || 0)"
            class="cart__discount-input"
            :class="{ 'disabled': pos.session?.allow_discount_change !== 1 }"
            step="0.01"
            min="0"
            max="100"
            placeholder="0"
          />
        </div>
        <div class="cart__discount-input-field">
          <label class="cart__discount-label">Disc Amt</label>
          <div class="cart__discount-prefix-wrap">
            <span class="cart__discount-prefix">{{ currencySymbol }}</span>
            <input
              type="number"
              :value="pos.additionalDiscount"
              :disabled="pos.session?.allow_discount_change !== 1"
              :readonly="pos.session?.allow_discount_change !== 1"
              @input="pos.setAdditionalDiscountAmount(parseFloat(($event.target as HTMLInputElement).value) || 0)"
              class="cart__discount-input cart__discount-input--amt"
              :class="{ 'disabled': pos.session?.allow_discount_change !== 1 }"
              step="1"
              min="0"
              placeholder="0"
            />
          </div>
        </div>
      </div>

      <div class="cart__row">
        <span>Subtotal</span>
        <span>{{ fmt(pos.subtotal) }}</span>
      </div>
      <div v-if="pos.totalDiscount > 0" class="cart__row cart__row--disc">
        <span>Discount</span>
        <span>−{{ fmt(pos.totalDiscount) }}</span>
      </div>
      <div
        v-for="tax in pos.taxes"
        :key="tax.account_head"
        class="cart__row"
      >
        <span>{{ tax.description }} ({{ tax.rate }}%)</span>
        <span>{{ fmt(tax.tax_amount) }}</span>
      </div>
      <!-- Grand Total (only show when rounding is enabled and adjustment exists) -->
      <div v-if="pos.session?.disable_rounded_total !== 1 && pos.roundingAdjustment !== 0" class="cart__row">
        <span>Grand Total</span>
        <span>{{ fmt(pos.grandTotal) }}</span>
      </div>
      <!-- Rounding Adjustment -->
      <div v-if="pos.session?.disable_rounded_total !== 1 && pos.roundingAdjustment !== 0" class="cart__row">
        <span>Rounding</span>
        <span>{{ fmt(pos.roundingAdjustment) }}</span>
      </div>
      <!-- Rounded/Final Total -->
      <div class="cart__row cart__row--grand">
        <span>Total</span>
        <span>{{ fmt(pos.roundedTotal) }}</span>
      </div>
    </div>

    <!-- ── Pay button ──────────────────────────── -->
    <div class="cart__foot">
      <button class="cart__pay" :disabled="!canCheckout" @click="emit('checkout')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        {{ canCheckout ? `Pay  ${fmt(pos.roundedTotal)}` : 'Pay' }}
      </button>
    </div>

    <!-- Clear Cart Confirmation Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showClearConfirm" class="confirm-overlay" @click.self="showClearConfirm = false">
          <div class="confirm-modal">
            <div class="confirm-modal__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
              </svg>
            </div>
            <h3 class="confirm-modal__title">Clear Cart</h3>
            <p class="confirm-modal__message">Are you sure you want to remove all items from your cart?</p>
            <div class="confirm-modal__actions">
              <button class="confirm-modal__btn confirm-modal__btn--cancel" @click="showClearConfirm = false">Cancel</button>
              <button class="confirm-modal__btn confirm-modal__btn--confirm" @click="triggerClearCart">Clear Cart</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePOSStore } from '../../stores/posStore';
import CustomerSelector from './CustomerSelector.vue';
import CartItem from './CartItem.vue';
import { formatCurrency, getCurrencySymbol } from '../../lib/currency';

const pos = usePOSStore();
const emit = defineEmits<{ (e: 'checkout'): void }>();

const showClearConfirm = ref(false);

const currencySymbol = computed(() => {
  return getCurrencySymbol(pos.session?.currency);
});

const canCheckout = computed(
  () => pos.cartItems.length > 0 && !!pos.selectedCustomer && pos.grandTotal > 0
);

function fmt(v: number) {
  return formatCurrency(v, pos.session?.currency);
}

function triggerClearCart() {
  pos.clearCart();
  showClearConfirm.value = false;
}
</script>

<style scoped>
/* ── Shell ───────────────────────────────────────── */
.cart {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--pos-bg);
  border-left: 1px solid var(--pos-border);
  overflow: hidden;
}

/* ── Header ──────────────────────────────────────── */
.cart__head {
  padding: 12px 14px;
  border-bottom: 1px solid var(--pos-border);
  background: var(--pos-surface);
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}
.cart__head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.cart__title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cart__title-ico { color: var(--pos-text-muted); }
.cart__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--pos-text);
  letter-spacing: 0.01em;
}
.cart__badge {
  background: var(--pos-accent);
  color: #fff;
  border-radius: 99px;
  padding: 1px 7px;
  font-size: 10px;
  font-weight: 700;
  min-width: 20px;
  text-align: center;
}
.cart__trash {
  background: none;
  border: 1px solid var(--pos-border);
  border-radius: 6px;
  padding: 4px 6px;
  color: var(--pos-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.1s;
}
.cart__trash:hover {
  color: var(--pos-danger, #dc2626);
  border-color: var(--pos-danger, #dc2626);
  background: rgba(220,38,38,0.06);
}

/* ── Items ───────────────────────────────────────── */
.cart__items {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  scrollbar-width: thin;
  scrollbar-color: var(--pos-border) transparent;
}

/* ── Empty ───────────────────────────────────────── */
.cart__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  color: var(--pos-text-muted);
}
.cart__empty-ico {
  width: 56px; height: 56px;
  border-radius: 14px;
  background: var(--pos-surface);
  border: 1px solid var(--pos-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pos-text-muted);
}
.cart__empty-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--pos-text);
  margin: 0;
}
.cart__empty-hint { font-size: 11px; color: var(--pos-text-muted); }

/* ── NumPad ──────────────────────────────────────── */
.cart__numpad {
  padding: 10px;
  border-top: 1px solid var(--pos-border);
  background: var(--pos-surface);
  flex-shrink: 0;
}


/* ── Totals ──────────────────────────────────────── */
.cart__totals {
  padding: 10px 14px;
  border-top: 1px solid var(--pos-border);
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: var(--pos-surface);
  flex-shrink: 0;
}
.cart__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--pos-text-muted);
  font-variant-numeric: tabular-nums;
}
.cart__row--disc {
  color: var(--pos-success, #16a34a);
  font-weight: 600;
}
.cart__row--grand {
  font-size: 17px;
  font-weight: 800;
  color: var(--pos-text);
  padding-top: 7px;
  margin-top: 2px;
  border-top: 1px solid var(--pos-border);
}

/* ── Footer / Pay button ─────────────────────────── */
.cart__foot {
  padding: 10px 12px 12px;
  background: var(--pos-surface);
  flex-shrink: 0;
}
.cart__pay {
  width: 100%;
  padding: 13px 16px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, var(--pos-accent, #6366f1) 0%, #8b5cf6 100%);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: opacity 0.15s, transform 0.1s, box-shadow 0.15s;
  box-shadow: 0 4px 18px rgba(99,102,241,0.3);
  letter-spacing: 0.01em;
  font-family: inherit;
}
.cart__pay:hover:not(:disabled) {
  opacity: 0.92;
  box-shadow: 0 6px 24px rgba(99,102,241,0.4);
}
.cart__pay:active:not(:disabled) { transform: scale(0.98); }
.cart__pay:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  box-shadow: none;
}

/* ── Invoice discount styling ─────────────────────── */
.cart__discount-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--pos-border);
}
.cart__discount-input-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cart__discount-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--pos-text-muted);
  letter-spacing: 0.5px;
}
.cart__discount-input {
  width: 100%;
  background: var(--pos-bg);
  border: 1px solid var(--pos-border);
  border-radius: 8px;
  padding: 6px 10px;
  color: var(--pos-text);
  font-size: 13px;
  font-weight: 600;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}
.cart__discount-input:focus {
  border-color: var(--pos-accent);
}
.cart__discount-prefix-wrap {
  display: flex;
  align-items: center;
  background: var(--pos-bg);
  border: 1px solid var(--pos-border);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.15s;
  width: 100%;
}
.cart__discount-prefix-wrap:focus-within {
  border-color: var(--pos-accent);
}
.cart__discount-prefix {
  padding: 6px 10px;
  background: var(--pos-surface-hover);
  border-right: 1px solid var(--pos-border);
  font-size: 11px;
  font-weight: 700;
  color: var(--pos-text-muted);
  user-select: none;
  flex-shrink: 0;
}
.cart__discount-input--amt {
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
  padding: 6px 10px !important;
  flex: 1;
  box-shadow: none !important;
}

/* ── Clear Cart Confirmation Modal ── */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.confirm-modal {
  background: var(--pos-surface, #fff);
  border: 1px solid var(--pos-border, #e2e8f0);
  border-radius: 16px;
  width: 100%;
  max-width: 360px;
  padding: 28px 24px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.confirm-modal__icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.confirm-modal__title {
  font-size: 18px;
  font-weight: 700;
  color: var(--pos-text, #1e293b);
  margin: 0 0 8px;
}

.confirm-modal__message {
  font-size: 14px;
  color: var(--pos-text-muted, #64748b);
  line-height: 1.5;
  margin: 0 0 24px;
}

.confirm-modal__actions {
  display: flex;
  gap: 12px;
  width: 100%;
}

.confirm-modal__btn {
  flex: 1;
  padding: 10px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.confirm-modal__btn--cancel {
  background: var(--pos-bg, #f1f5f9);
  color: var(--pos-text, #475569);
  border: 1px solid var(--pos-border, #cbd5e1);
}

.confirm-modal__btn--cancel:hover {
  background: var(--pos-border, #e2e8f0);
}

.confirm-modal__btn--confirm {
  background: #ef4444;
  color: #fff;
}

.confirm-modal__btn--confirm:hover {
  background: #dc2626;
}

.confirm-modal__btn:active {
  transform: scale(0.98);
}
</style>

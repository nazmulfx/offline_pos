<!--
  PaymentModal.vue — Payment modal with multiple payment methods + submit
-->
<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="payment-modal-overlay" @click.self="closeIfNotSubmitting">
        <div class="payment-modal">
          <!-- Header -->
          <div class="payment-modal__header">
            <h2 class="payment-modal__title">Payment</h2>
            <button class="payment-modal__close" @click="close">✕</button>
          </div>

          <!-- Order Summary -->
          <div class="payment-modal__summary">
            <div class="payment-modal__summary-row">
              <span>Net Total</span>
              <span>{{ fmt(netTotal) }}</span>
            </div>
            <div
              v-for="tax in pos.taxes"
              :key="tax.account_head"
              class="payment-modal__summary-row"
            >
              <span>{{ tax.description }} ({{ tax.rate }}%)</span>
              <span>{{ fmt(tax.tax_amount) }}</span>
            </div>
            <div class="payment-modal__summary-row" :class="{ 'payment-modal__summary-row--divider': pos.session?.disable_rounded_total === 1 }">
              <span :class="{ 'font-bold': pos.session?.disable_rounded_total === 1 }">Grand Total</span>
              <span :class="{ 'payment-modal__grand': pos.session?.disable_rounded_total === 1 }">{{ fmt(pos.grandTotal) }}</span>
            </div>
            <div v-if="pos.session?.disable_rounded_total !== 1 && pos.roundingAdjustment !== 0" class="payment-modal__summary-row">
              <span>Rounding Adjustment</span>
              <span>{{ fmt(pos.roundingAdjustment) }}</span>
            </div>
            <div v-if="pos.session?.disable_rounded_total !== 1" class="payment-modal__summary-row payment-modal__summary-row--divider">
              <span class="font-bold">Rounded Total</span>
              <span class="payment-modal__grand">{{ fmt(payableTotal) }}</span>
            </div>
            <div class="payment-modal__summary-row">
              <span>Amount Paid</span>
              <span :class="{ 'paid-ok': amountPaid >= payableTotal }">{{ fmt(amountPaid) }}</span>
            </div>
            <div class="payment-modal__summary-row payment-modal__summary-row--outstanding" v-if="pos.session?.allow_partial_payment === 1 && outstandingAmount > 0">
              <span>Outstanding (Credit)</span>
              <span class="payment-modal__outstanding">{{ fmt(outstandingAmount) }}</span>
            </div>
            <div class="payment-modal__summary-row" v-if="change > 0">
              <span>Change</span>
              <span class="payment-modal__change">{{ fmt(change) }}</span>
            </div>
          </div>

          <!-- Payment Methods -->
          <div class="payment-modal__methods">
            <div
              v-for="(method, idx) in paymentMethods"
              :key="idx"
              class="payment-modal__method"
            >
              <label class="payment-modal__method-label" @click.prevent="selectMethod(idx)">
                <input
                  type="radio"
                  :checked="primaryMethodIdx === idx"
                  class="payment-modal__radio"
                />
                <span class="payment-modal__method-icon">
                  {{ methodIcon(method.mode_of_payment) }}
                </span>
                <span class="payment-modal__method-name">{{ method.mode_of_payment }}</span>
              </label>
              <input
                type="number"
                class="payment-modal__amount-input"
                :class="{ active: primaryMethodIdx === idx }"
                v-model.number="method.amount"
                min="0"
                step="0.01"
                @focus="onInputFocus($event, idx)"
              />
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="payment-modal__quick">
            <button
              class="payment-modal__quick-btn"
              :class="{ 'payment-modal__quick-btn--exact': amountPaid >= payableTotal && amountPaid > 0 }"
              @click="setExact"
            >
              Exact Pay
            </button>
            <button
              v-if="pos.session?.allow_partial_payment === 1"
              class="payment-modal__quick-btn"
              :class="{ 'payment-modal__quick-btn--credit': amountPaid === 0 }"
              @click="setCredit"
            >
              Credit Sale (0)
            </button>
          </div>



          <!-- Footer actions -->
          <div class="payment-modal__footer">
            <button class="payment-modal__cancel-btn" @click="close">Cancel</button>
            <button
              class="payment-modal__submit-btn"
              :disabled="!canSubmit || isSubmitting"
              @click="submitPayment"
            >
              <span v-if="isSubmitting" class="spinner-sm"></span>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {{ 
                isSubmitting 
                  ? 'Processing...' 
                  : (amountPaid >= payableTotal 
                      ? (network.isOnline ? 'Submit Invoice' : 'Save Offline') 
                      : (amountPaid === 0 
                          ? (network.isOnline ? 'Submit Credit Sale' : 'Save Credit Sale') 
                          : (network.isOnline ? 'Submit Partial Payment' : 'Save Partial Payment')
                        )
                    )
              }}
            </button>
          </div>

          <!-- Offline reminder -->
          <div v-if="!network.isOnline" class="payment-modal__offline-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Invoice will be saved locally and synced when online
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePOSStore } from '../../stores/posStore';
import { useNetworkStore } from '../../stores/networkStore';
import { useSyncStore } from '../../stores/syncStore';
import { submitInvoice } from '../../services/invoiceService';

import { formatCurrency } from '../../lib/currency';

const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'success', invoiceName: string, offline: boolean, doc?: any, preOpenedWindow?: Window | null): void;
}>();

const pos = usePOSStore();
const network = useNetworkStore();
const sync = useSyncStore();

const payableTotal = computed(() => pos.roundedTotal);

// Payment methods from POS profile
const paymentMethods = ref<Array<{ mode_of_payment: string; amount: number }>>([]);
const primaryMethodIdx = ref(0);
const isSubmitting = ref(false);

watch(
  () => props.isOpen,
  (open) => {
    if (open) initPaymentMethods();
  }
);

function initPaymentMethods() {
  const profilePayments = pos.session?.payments || [];
  if (profilePayments.length > 0) {
    paymentMethods.value = profilePayments.map((p) => ({
      mode_of_payment: p.mode_of_payment,
      amount: 0,
    }));
  } else {
    paymentMethods.value = [{ mode_of_payment: 'Cash', amount: 0 }];
  }
  // Auto-set cash to grand total
  if (paymentMethods.value.length > 0) {
    paymentMethods.value[0].amount = payableTotal.value;
  }
  primaryMethodIdx.value = 0;
}

const amountPaid = computed(() =>
  paymentMethods.value.reduce((sum, m) => sum + (m.amount || 0), 0)
);

const change = computed(() => Math.max(0, amountPaid.value - payableTotal.value));

const netTotal = computed(() => pos.subtotal - pos.totalDiscount);

const outstandingAmount = computed(() => Math.max(0, payableTotal.value - amountPaid.value));

const canSubmit = computed(() => {
  if (!pos.selectedCustomer || pos.cartItems.length === 0) return false;
  const allowPartial = pos.session?.allow_partial_payment === 1;
  if (allowPartial) return true;
  return amountPaid.value >= payableTotal.value;
});

function selectMethod(idx: number) {
  const oldIdx = primaryMethodIdx.value;
  primaryMethodIdx.value = idx;

  const total = payableTotal.value;
  const currentVal = Number(paymentMethods.value[idx].amount) || 0;

  // Calculate sum of all other methods excluding target idx
  let sumOthers = 0;
  let oldMethodHoldsFullTotal = false;
  paymentMethods.value.forEach((m, i) => {
    if (i !== idx) {
      const amt = Number(m.amount) || 0;
      sumOthers += amt;
      if (i === oldIdx && amt === total) {
        oldMethodHoldsFullTotal = true;
      }
    }
  });

  // 1. If previous method held 100% of payable total (e.g., default Cash = 600), move total to new method
  if (oldMethodHoldsFullTotal && oldIdx >= 0 && oldIdx !== idx) {
    paymentMethods.value[oldIdx].amount = 0;
    paymentMethods.value[idx].amount = total;
  }
  // 2. If target method is currently 0, auto-fill remaining unpaid balance
  else if (currentVal === 0 && sumOthers < total) {
    const remaining = Math.round((total - sumOthers) * 100) / 100;
    paymentMethods.value[idx].amount = remaining;
  }
  // 3. If target method already has a non-zero amount (e.g. Cash = 150), preserve it so user can edit!
}

function onInputFocus(e: Event, idx: number) {
  selectMethod(idx);
  const target = e.target as HTMLInputElement;
  if (target) {
    setTimeout(() => {
      try {
        const valStr = String(target.value ?? '');
        const len = valStr.length;
        if (target.type === 'number') {
          target.type = 'text';
          target.setSelectionRange(len, len);
          target.type = 'number';
        } else if (typeof target.setSelectionRange === 'function') {
          target.setSelectionRange(len, len);
        }
      } catch (_) {
        // Fallback for browsers that don't allow type toggling
      }
    }, 10);
  }
}

function setExact() {
  const idx = primaryMethodIdx.value;
  paymentMethods.value.forEach((p, i) => {
    p.amount = i === idx ? payableTotal.value : 0;
  });
}

function setCredit() {
  paymentMethods.value.forEach((p) => {
    p.amount = 0;
  });
}



function methodIcon(method: string): string {
  const icons: Record<string, string> = {
    Cash: '💵', Card: '💳', 'Bank Transfer': '🏦', Check: '📄', Cheque: '📄',
  };
  return icons[method] || '💳';
}

function fmt(value: number): string {
  return formatCurrency(value, pos.session?.currency);
}

async function submitPayment() {
  if (!canSubmit.value || isSubmitting.value) return;
  if (!pos.selectedCustomer || !pos.session) return;

  const stockCheck = await pos.checkCartStock();
  if (!stockCheck.valid) {
    pos.showAlert("Out of Stock", stockCheck.error || "Some items are out of stock.");
    return;
  }

  let printWindow: Window | null = null;

  isSubmitting.value = true;
  try {
    const result = await submitInvoice({
      session: pos.session,
      customer: pos.selectedCustomer,
      cartItems: pos.cartItems,
      payments: paymentMethods.value,
      discount: pos.cartDiscount,
      additionalDiscount: pos.additionalDiscount,
      isOnline: network.isOnline,
      subtotal: pos.subtotal,
      grandTotal: pos.grandTotal,
      totalTaxes: pos.totalTaxes,
      taxes: pos.taxes,
    });

    if (result.success) {
      if (pos.selectedCustomer?.name && outstandingAmount.value > 0) {
        await pos.updateOfflineCustomerBalance(pos.selectedCustomer.name, outstandingAmount.value);
      }
      if (result.offline) {
        await sync.refreshPendingCount();
      }
      await pos.decrementStock(pos.cartItems);
      if (pos.currentDraftId !== null) {
        await pos.discardHeldInvoice(pos.currentDraftId);
      }
      pos.clearCart();
      emit('success', result.invoiceName || `OFFLINE-${result.localId}`, !!result.offline, result.doc, printWindow);
      close();
    } else {
      if (printWindow) printWindow.close();
      const errText = result.error || 'Failed to submit invoice';
      if (errText.includes('CSRFTokenError') || errText.includes('Invalid Request')) {
        pos.showAlert('CSRF Token Error', 'Your security session has expired. Please reload the page to post data to the online server.', 'error');
      } else {
        pos.showAlert('Payment Error', errText);
      }
    }
  } catch (err: any) {
    if (printWindow) printWindow.close();
    const errMsg = err?.message || err?.exc || '';
    if (err?.exc_type === 'CSRFTokenError' || errMsg.includes('CSRFTokenError') || errMsg.includes('Invalid Request')) {
      pos.showAlert('CSRF Token Error', 'Your security session has expired. Please reload the page to post data to the online server.', 'error');
    } else {
      pos.showAlert('Payment Error', err?.message || 'Failed to submit invoice');
    }
  } finally {
    isSubmitting.value = false;
  }
}

function close() { emit('close'); }
function closeIfNotSubmitting() { if (!isSubmitting.value) close(); }
</script>

<style scoped>
.payment-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.payment-modal {
  background: var(--pos-surface);
  border: 1px solid var(--pos-border);
  border-radius: 20px;
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
}
.payment-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--pos-border);
}
.payment-modal__title {
  font-size: 20px;
  font-weight: 800;
  color: var(--pos-text);
  margin: 0;
}
.payment-modal__close {
  background: var(--pos-surface-hover);
  border: none;
  color: var(--pos-text-muted);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
}
.payment-modal__close:hover { background: rgba(248,113,113,0.15); color: #f87171; }
.payment-modal__summary {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid var(--pos-border);
  background: var(--pos-bg);
}
.payment-modal__summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: var(--pos-text-muted);
  font-variant-numeric: tabular-nums;
}
.payment-modal__grand {
  font-size: 22px;
  font-weight: 800;
  color: var(--pos-text);
}
.paid-ok { color: #34d399 !important; font-weight: 700; }
.payment-modal__change { color: #34d399; font-weight: 700; }
.payment-modal__outstanding { color: var(--pos-warning); font-weight: 700; }
.payment-modal__summary-row--outstanding {
  background: rgba(217, 119, 6, 0.05);
  border-radius: 8px;
  padding: 6px 10px;
  margin: 4px -10px;
  border-left: 3px solid var(--pos-warning);
}
.payment-modal__quick-btn--credit {
  background: rgba(217, 119, 6, 0.12);
  border-color: var(--pos-warning);
  color: var(--pos-warning);
}
.payment-modal__quick-btn--credit:hover {
  border-color: var(--pos-warning);
  background: rgba(217, 119, 6, 0.18);
}
.payment-modal__summary-row--divider {
  border-top: 1px dashed var(--pos-border);
  padding-top: 8px;
  margin-top: 4px;
}
.font-bold {
  font-weight: 700;
  color: var(--pos-text);
}
.payment-modal__methods {
  padding: 14px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid var(--pos-border);
}
.payment-modal__method {
  display: flex;
  align-items: center;
  gap: 10px;
}
.payment-modal__method-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  cursor: pointer;
}
.payment-modal__radio { accent-color: var(--pos-accent); width: 16px; height: 16px; }
.payment-modal__method-icon { font-size: 18px; }
.payment-modal__method-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--pos-text);
}
.payment-modal__amount-input {
  width: 120px;
  background: var(--pos-bg);
  border: 1px solid var(--pos-border);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--pos-text);
  font-size: 16px;
  font-weight: 700;
  text-align: right;
  outline: none;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  transition: border-color 0.15s;
}
.payment-modal__amount-input.active { border-color: var(--pos-accent); }
.payment-modal__quick {
  padding: 10px 20px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--pos-border);
}
.payment-modal__quick-btn {
  flex: 1;
  min-width: 80px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--pos-border);
  background: var(--pos-surface);
  color: var(--pos-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
}
.payment-modal__quick-btn:hover { border-color: var(--pos-accent); color: var(--pos-accent); }
.payment-modal__quick-btn--exact {
  background: rgba(99,102,241,0.12);
  border-color: var(--pos-accent);
  color: var(--pos-accent);
}
.payment-modal__footer {
  padding: 14px 20px;
  display: flex;
  gap: 10px;
  border-top: 1px solid var(--pos-border);
}
.payment-modal__cancel-btn {
  flex: 1;
  padding: 13px;
  border-radius: 10px;
  border: 1px solid var(--pos-border);
  background: transparent;
  color: var(--pos-text-muted);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
}
.payment-modal__cancel-btn:hover { border-color: var(--pos-text-muted); color: var(--pos-text); }
.payment-modal__submit-btn {
  flex: 2;
  padding: 13px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.18s;
  box-shadow: 0 4px 20px rgba(99,102,241,0.3);
}
.payment-modal__submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 28px rgba(99,102,241,0.4);
}
.payment-modal__submit-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
.payment-modal__offline-note {
  margin: 0 20px 16px;
  padding: 8px 12px;
  background: rgba(251,191,36,0.1);
  border: 1px solid rgba(251,191,36,0.3);
  border-radius: 8px;
  font-size: 12px;
  color: #fbbf24;
  display: flex;
  align-items: center;
  gap: 6px;
}
.spinner-sm {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }
.modal-enter-active, .modal-leave-active { transition: all 0.25s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .payment-modal, .modal-leave-to .payment-modal { transform: scale(0.95) translateY(20px); }
</style>

<!--
  POSClosingModal.vue — POS Session Closing Modal
  Shows session summary, payment reconciliation, and submits POS Closing Entry
-->
<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="closing-overlay" @click.self="closeIfIdle">
        <div class="closing-modal">

          <!-- ─── Header ─────────────────────────────────────────────── -->
          <div class="closing-modal__header">
            <div class="closing-modal__header-left">
              <div class="closing-modal__header-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </div>
              <div>
                <h2 class="closing-modal__title">Close POS Session</h2>
                <p class="closing-modal__subtitle">{{ pos.session?.pos_profile }}</p>
              </div>
            </div>
            <button class="closing-modal__close" @click="emit('close')" :disabled="isSubmitting">✕</button>
          </div>

          <!-- ─── Loading ───────────────────────────────────────────── -->
          <div v-if="isLoading" class="closing-modal__loading">
            <span class="spinner-lg"></span>
            <p>Loading session summary...</p>
          </div>

          <!-- ─── Error ─────────────────────────────────────────────── -->
          <div v-else-if="loadError" class="closing-modal__error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>{{ loadError }}</p>
            <button class="closing-modal__retry-btn" @click="loadSummary">Retry</button>
          </div>

          <!-- ─── Content ───────────────────────────────────────────── -->
          <template v-else-if="summary">

            <!-- Session Stats -->
            <div class="closing-modal__stats">
              <div class="closing-modal__stat">
                <span class="closing-modal__stat-label">Invoices</span>
                <span class="closing-modal__stat-val">{{ summary.invoice_count }}</span>
              </div>
              <div class="closing-modal__stat">
                <span class="closing-modal__stat-label">Net Total</span>
                <span class="closing-modal__stat-val">{{ fmt(summary.net_total) }}</span>
              </div>
              <div class="closing-modal__stat">
                <span class="closing-modal__stat-label">Taxes</span>
                <span class="closing-modal__stat-val">{{ fmt(summary.total_taxes) }}</span>
              </div>
              <div class="closing-modal__stat closing-modal__stat--accent">
                <span class="closing-modal__stat-label">Grand Total</span>
                <span class="closing-modal__stat-val">{{ fmt(summary.grand_total) }}</span>
              </div>
            </div>

            <!-- Session Period -->
            <div class="closing-modal__period">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>{{ formatDate(summary.start_date) }} → {{ formatDate(summary.end_date) }}</span>
            </div>

            <!-- Payment Reconciliation -->
            <div class="closing-modal__section">
              <h3 class="closing-modal__section-title">Payment Reconciliation</h3>
              <div class="closing-modal__payments">
                <!-- Header -->
                <div class="closing-modal__payment-row closing-modal__payment-row--header">
                  <span>Mode</span>
                  <span>Opening</span>
                  <span>Expected</span>
                  <span>Closing</span>
                  <span>Diff</span>
                </div>
                <!-- Rows -->
                <div
                  v-for="(payment, idx) in closingPayments"
                  :key="payment.mode_of_payment"
                  class="closing-modal__payment-row"
                >
                  <span class="closing-modal__payment-method">
                    {{ methodIcon(payment.mode_of_payment) }} {{ payment.mode_of_payment }}
                  </span>
                  <span class="closing-modal__payment-amount">{{ fmt(payment.opening_amount) }}</span>
                  <span class="closing-modal__payment-amount">{{ fmt(payment.expected_amount) }}</span>
                  <div class="closing-modal__payment-input-wrap">
                    <input
                      v-model.number="closingPayments[idx].closing_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      class="closing-modal__payment-input"
                      @input="updateDifference(idx)"
                    />
                  </div>
                  <span
                    class="closing-modal__payment-diff"
                    :class="{
                      'diff-positive': payment.difference > 0,
                      'diff-negative': payment.difference < 0,
                      'diff-zero': payment.difference === 0
                    }"
                  >
                    {{ payment.difference > 0 ? '+' : '' }}{{ fmt(payment.difference) }}
                  </span>
                </div>
                <!-- Credit Sale Row -->
                <div v-if="creditSales > 0" class="closing-modal__payment-row closing-modal__payment-row--credit-sale">
                  <span class="closing-modal__payment-method">
                    📝 Credit Sale
                  </span>
                  <span class="closing-modal__payment-amount">—</span>
                  <span class="closing-modal__payment-amount" style="font-weight: 700;">{{ fmt(creditSales) }}</span>
                  <span class="closing-modal__payment-amount">—</span>
                  <span class="closing-modal__payment-amount">—</span>
                </div>
              </div>
            </div>

            <!-- Submit Error -->
            <div v-if="submitError" class="closing-modal__submit-error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {{ submitError }}
            </div>

            <!-- Offline warning -->
            <div v-if="!network.isOnline" class="closing-modal__offline-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
                <line x1="10.71" y1="5.05" x2="10.71" y2="5.06"/>
                <line x1="1.42" y1="9" x2="1.43" y2="9"/>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                <line x1="12" y1="20" x2="12.01" y2="20"/>
              </svg>
              You are offline. Please connect to internet before closing POS.
            </div>
          </template>

          <!-- ─── Footer ────────────────────────────────────────────── -->
          <div class="closing-modal__footer" v-if="!isLoading && !loadError">
            <button class="closing-modal__cancel-btn" @click="emit('close')" :disabled="isSubmitting">
              Cancel
            </button>
            <button
              class="closing-modal__submit-btn"
              :disabled="isSubmitting || !summary || !network.isOnline"
              @click="handleClose"
            >
              <span v-if="isSubmitting" class="spinner-sm"></span>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {{ isSubmitting ? 'Closing...' : 'Submit & Close POS' }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { usePOSStore } from '../../stores/posStore';
import { useNetworkStore } from '../../stores/networkStore';
import {
  fetchClosingSummary,
  submitClosingEntry,
  type ClosingSummary,
  type ClosingPaymentRow,
} from '../../services/closingService';

const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'closed', closingName: string): void;
}>();

const pos = usePOSStore();
const network = useNetworkStore();

const isLoading = ref(false);
const isSubmitting = ref(false);
const loadError = ref<string | null>(null);
const submitError = ref<string | null>(null);
const summary = ref<ClosingSummary | null>(null);
const closingPayments = ref<ClosingPaymentRow[]>([]);

const creditSales = computed(() => {
  if (!summary.value) return 0;
  const totalExpected = summary.value.payments.reduce((acc, p) => acc + p.expected_amount, 0);
  return Math.max(0, summary.value.grand_total - totalExpected);
});

// Load summary when modal opens
watch(() => props.isOpen, (open) => {
  if (open) {
    submitError.value = null;
    loadSummary();
  }
});

async function loadSummary() {
  if (!pos.session) return;
  isLoading.value = true;
  loadError.value = null;

  try {
    // Get opening payments from session
    const openingPayments = (pos.session.payments || []).map((p: any) => ({
      mode_of_payment: p.mode_of_payment,
      opening_amount: p.opening_amount || p.amount || 0,
    }));

    const user = getLoggedInUser();
    const data = await fetchClosingSummary(
      pos.session.pos_profile,
      user,
      pos.session.period_start_date,
      openingPayments
    );

    summary.value = data;
    // Deep copy payments for editable state
    closingPayments.value = data.payments.map((p) => ({ ...p }));
  } catch (err: any) {
    const messages: string[] = err?.messages || [];
    loadError.value = messages.length > 0
      ? messages.join('\n')
      : err?.message || 'Failed to load session summary';
  } finally {
    isLoading.value = false;
  }
}

function updateDifference(idx: number) {
  const p = closingPayments.value[idx];
  p.difference = p.closing_amount - (p.opening_amount + p.expected_amount);
}

async function handleClose() {
  if (!pos.session || !summary.value || isSubmitting.value) return;
  isSubmitting.value = true;
  submitError.value = null;

  try {
    const result = await submitClosingEntry(pos.session, summary.value, closingPayments.value);
    if (result.success) {
      pos.clearSession();
      emit('closed', result.name || '');
    } else {
      submitError.value = result.error || 'Failed to close POS';
    }
  } finally {
    isSubmitting.value = false;
  }
}

function closeIfIdle() {
  if (!isSubmitting.value) emit('close');
}

function fmt(value: number): string {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: pos.session?.currency || 'BDT',
    minimumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-BD', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function methodIcon(method: string): string {
  const icons: Record<string, string> = {
    Cash: '💵', Card: '💳', 'Bank Transfer': '🏦', Check: '📄', Cheque: '📄',
  };
  return icons[method] || '💳';
}

function getLoggedInUser(): string {
  const cookies = Object.fromEntries(
    document.cookie.split('; ').filter(Boolean).map((part) => {
      const [k, ...v] = part.split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
  return cookies.user_id || 'Administrator';
}
</script>

<style scoped>
.closing-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(5px);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.closing-modal {
  background: var(--pos-surface);
  border: 1px solid var(--pos-border);
  border-radius: 20px;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
}
/* ─── Header ─────────────────────────────────────────────── */
.closing-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--pos-border);
  background: var(--pos-surface);
  border-radius: 20px 20px 0 0;
}
.closing-modal__header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.closing-modal__header-icon {
  width: 40px; height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.closing-modal__title {
  font-size: 18px;
  font-weight: 800;
  color: var(--pos-text);
  margin: 0;
}
.closing-modal__subtitle { font-size: 12px; color: var(--pos-text-muted); margin: 0; }
.closing-modal__close {
  background: var(--pos-surface-hover);
  border: none;
  color: var(--pos-text-muted);
  width: 32px; height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
}
.closing-modal__close:hover { background: rgba(248,113,113,0.15); color: #f87171; }
.closing-modal__close:disabled { opacity: 0.4; cursor: not-allowed; }
/* ─── Loading ─────────────────────────────────────────────── */
.closing-modal__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 40px;
  color: var(--pos-text-muted);
  font-size: 14px;
}
/* ─── Error ────────────────────────────────────────────────── */
.closing-modal__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px;
  color: #f87171;
  font-size: 14px;
  text-align: center;
}
.closing-modal__retry-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid var(--pos-border);
  background: var(--pos-surface-hover);
  color: var(--pos-text);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
/* ─── Stats ────────────────────────────────────────────────── */
.closing-modal__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--pos-border);
  border-bottom: 1px solid var(--pos-border);
}
.closing-modal__stat {
  background: var(--pos-bg);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.closing-modal__stat--accent { background: rgba(99,102,241,0.06); }
.closing-modal__stat-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--pos-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.closing-modal__stat-val {
  font-size: 18px;
  font-weight: 800;
  color: var(--pos-text);
  font-variant-numeric: tabular-nums;
}
.closing-modal__stat--accent .closing-modal__stat-val { color: var(--pos-accent); }
/* ─── Period ────────────────────────────────────────────────── */
.closing-modal__period {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  font-size: 12px;
  color: var(--pos-text-muted);
  background: var(--pos-bg);
  border-bottom: 1px solid var(--pos-border);
}
/* ─── Section ────────────────────────────────────────────────── */
.closing-modal__section { padding: 20px 24px; }
.closing-modal__section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--pos-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 12px;
}
/* ─── Payments Table ─────────────────────────────────────────── */
.closing-modal__payments {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--pos-border);
  border-radius: 10px;
  overflow: hidden;
}
.closing-modal__payment-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--pos-border);
  font-size: 13px;
}
.closing-modal__payment-row:last-child { border-bottom: none; }
.closing-modal__payment-row--header {
  background: var(--pos-bg);
  font-size: 11px;
  font-weight: 700;
  color: var(--pos-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.closing-modal__payment-row--credit-sale {
  background: rgba(99, 102, 241, 0.04);
}
.closing-modal__payment-method {
  font-weight: 600;
  color: var(--pos-text);
  display: flex;
  align-items: center;
  gap: 6px;
}
.closing-modal__payment-amount {
  font-variant-numeric: tabular-nums;
  color: var(--pos-text-muted);
  font-size: 13px;
}
.closing-modal__payment-input-wrap { display: flex; }
.closing-modal__payment-input {
  width: 100%;
  background: var(--pos-bg);
  border: 1px solid var(--pos-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--pos-text);
  font-size: 13px;
  font-weight: 700;
  text-align: right;
  outline: none;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  transition: border-color 0.15s;
}
.closing-modal__payment-input:focus { border-color: var(--pos-accent); }
.closing-modal__payment-diff {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.diff-positive { color: #34d399; }
.diff-negative { color: #f87171; }
.diff-zero { color: var(--pos-text-muted); }
/* ─── Errors & Warnings ─────────────────────────────────────── */
.closing-modal__submit-error {
  margin: 0 24px;
  padding: 10px 14px;
  background: rgba(248,113,113,0.1);
  border: 1px solid rgba(248,113,113,0.3);
  border-radius: 8px;
  font-size: 12px;
  color: #f87171;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  white-space: pre-wrap;
}
.closing-modal__offline-note {
  margin: 0 24px;
  padding: 10px 14px;
  background: rgba(251,191,36,0.1);
  border: 1px solid rgba(251,191,36,0.3);
  border-radius: 8px;
  font-size: 12px;
  color: #fbbf24;
  display: flex;
  align-items: center;
  gap: 8px;
}
/* ─── Footer ─────────────────────────────────────────────────── */
.closing-modal__footer {
  display: flex;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--pos-border);
  margin-top: 12px;
}
.closing-modal__cancel-btn {
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
.closing-modal__cancel-btn:hover:not(:disabled) {
  border-color: var(--pos-text-muted);
  color: var(--pos-text);
}
.closing-modal__cancel-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.closing-modal__submit-btn {
  flex: 2;
  padding: 13px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #dc2626, #b91c1c);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.18s;
  box-shadow: 0 4px 20px rgba(220,38,38,0.3);
}
.closing-modal__submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 28px rgba(220,38,38,0.4);
}
.closing-modal__submit-btn:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
/* ─── Spinners ────────────────────────────────────────────────── */
.spinner-lg {
  width: 36px; height: 36px;
  border: 3px solid var(--pos-border);
  border-top-color: var(--pos-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
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
.modal-enter-from .closing-modal, .modal-leave-to .closing-modal {
  transform: scale(0.95) translateY(20px);
}
</style>

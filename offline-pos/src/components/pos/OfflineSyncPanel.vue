<!--
  OfflineSyncPanel.vue — Slide-in drawer showing offline-queued customers & invoices.
  Allows manual sync trigger. Opened from the topbar sync badge.
-->
<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="osp-backdrop">
      <div v-if="isOpen" class="osp-backdrop" @click.self="handleBackdropClick" />
    </Transition>

    <!-- Panel -->
    <Transition name="osp-panel">
      <div v-if="isOpen" class="osp-panel" role="dialog" aria-label="Offline Sync Queue">

        <!-- Header -->
        <div class="osp-header">
          <!-- Back button — top left -->
          <button class="osp-header__back" @click="$emit('close')" title="Back to POS">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back to POS
          </button>

          <!-- Title + close -->
          <div class="osp-header__row">
            <div class="osp-header__title">
              <span class="osp-header__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </span>
              <div>
                <h2 class="osp-header__h2">Offline Queue</h2>
                <p class="osp-header__sub">{{ totalPending }} item{{ totalPending !== 1 ? 's' : '' }} pending sync</p>
              </div>
            </div>
            <button class="osp-header__close" @click="$emit('close')" title="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Sync Status Bar -->
        <div class="osp-statusbar" :class="statusBarClass">
          <span class="osp-statusbar__dot"></span>
          <span class="osp-statusbar__text">{{ statusText }}</span>
          <button
            v-if="network.isOnline && !sync.isSyncing"
            class="osp-sync-btn"
            @click="manualSync"
            :disabled="totalPending === 0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Sync Now
          </button>
          <div v-if="sync.isSyncing" class="osp-syncing-indicator">
            <span class="osp-spin"></span> Syncing…
          </div>
        </div>

        <!-- Error Banner -->
        <div v-if="sync.syncError" class="osp-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{{ sync.syncError }}</span>
        </div>

        <!-- Content -->
        <div class="osp-body" v-if="!isLoading">

          <!-- Customers Section -->
          <section v-if="customerItems.length > 0" class="osp-section">
            <div class="osp-section__header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <span>Customers</span>
              <span class="osp-badge osp-badge--amber">{{ customerItems.length }}</span>
            </div>

            <div class="osp-list">
              <div
                v-for="item in customerItems"
                :key="item.id"
                class="osp-item-wrap"
              >
                <div
                  class="osp-item"
                  :class="{ 'osp-item--error': isFailed(item.id) }"
                >
                  <div class="osp-item__avatar">
                    {{ item.payload?.doc?.customer_name?.charAt(0)?.toUpperCase() || '?' }}
                  </div>
                  <div class="osp-item__info">
                    <span class="osp-item__name">{{ item.payload?.doc?.customer_name || 'Unknown' }}</span>
                    <span class="osp-item__meta">
                      <template v-if="item.payload?.doc?.mobile_no">📞 {{ item.payload.doc.mobile_no }}</template>
                      <template v-else-if="item.payload?.doc?.email_id">✉ {{ item.payload.doc.email_id }}</template>
                      <template v-else>No contact info</template>
                    </span>
                    <span class="osp-item__temp">ID: {{ item.payload?.temp_name }}</span>
                  </div>
                  <div class="osp-item__status">
                    <span v-if="isFailed(item.id)" class="osp-status osp-status--error" title="Last sync failed">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                      Failed
                    </span>
                    <span v-else class="osp-status osp-status--pending">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                      Pending
                    </span>
                    <span class="osp-item__time">{{ formatTime(item.created_at) }}</span>
                  </div>
                </div>
                <!-- Per-item error reason -->
                <div v-if="isFailed(item.id)" class="osp-item-error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" class="osp-item-error__icon">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>{{ getError(item.id) }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Invoices Section -->
          <section v-if="invoiceItems.length > 0" class="osp-section">
            <div class="osp-section__header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
              <span>Invoices</span>
              <span class="osp-badge osp-badge--purple">{{ invoiceItems.length }}</span>
            </div>

            <div class="osp-list">
              <div
                v-for="item in invoiceItems"
                :key="item.id"
                class="osp-item-wrap"
              >
                <div
                  class="osp-item"
                  :class="{ 'osp-item--error': isFailed(item.id), 'osp-item--blocked': isBlocked(item) }"
                >
                  <div class="osp-item__avatar osp-item__avatar--invoice">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <div class="osp-item__info">
                    <span class="osp-item__name">
                      {{ item.payload?.invoice?.customer || 'Unknown Customer' }}
                    </span>
                    <span class="osp-item__meta">
                      {{ item.payload?.invoice?.items?.length || 0 }} item(s) ·
                      {{ formatCurrency(invoiceTotal(item)) }}
                    </span>
                    <span class="osp-item__temp osp-item__temp--warn" v-if="isBlocked(item)">
                      ⚠ Waiting for customer to sync first
                    </span>
                  </div>
                  <div class="osp-item__status">
                    <span v-if="isBlocked(item)" class="osp-status osp-status--blocked">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                      </svg>
                      Blocked
                    </span>
                    <span v-else-if="isFailed(item.id)" class="osp-status osp-status--error">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                      Failed
                    </span>
                    <span v-else class="osp-status osp-status--pending">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                      Pending
                    </span>
                    <span class="osp-item__time">{{ formatTime(item.created_at) }}</span>

                    <!-- View Details Button inside Invoice Row -->
                    <button class="osp-view-btn" @click.stop="openInvoiceModal(item)" title="View Invoice Details">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      View Details
                    </button>
                  </div>
                </div>
                <!-- Per-item error / blocked reason -->
                <div v-if="isFailed(item) || isBlocked(item)" class="osp-item-error" :class="{ 'osp-item-error--warn': isBlocked(item) }">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" class="osp-item-error__icon">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>{{ isBlocked(item) ? `Blocked: Temporary customer "${item.payload?.invoice?.customer || ''}" not synced. Click View Details to reassign customer.` : getError(item) }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Empty -->
          <div v-if="customerItems.length === 0 && invoiceItems.length === 0" class="osp-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <p>All synced!</p>
            <span>No pending items in the queue.</span>
          </div>
        </div>

        <!-- Loading -->
        <div v-else class="osp-loading">
          <span class="osp-spin osp-spin--lg"></span>
          <span>Loading queue…</span>
        </div>

        <!-- Footer -->
        <div class="osp-footer">
          <span class="osp-footer__hint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Customers sync first, then their invoices.
          </span>
        </div>
      </div>
    </Transition>

    <!-- Invoice Details Modal -->
    <PendingInvoiceModal
      :is-open="isInvoiceModalOpen"
      :item="selectedInvoiceItem"
      :error-message="selectedInvoiceItem ? getError(selectedInvoiceItem) : null"
      @close="closeInvoiceModal"
      @updated="loadQueue"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useNetworkStore } from '../../stores/networkStore';
import { useSyncStore } from '../../stores/syncStore';
import { usePOSStore } from '../../stores/posStore';
import { getSyncQueue } from '../../db/posDB';
import { formatCurrency as globalFormatCurrency } from '../../lib/currency';
import PendingInvoiceModal from './PendingInvoiceModal.vue';

const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const network = useNetworkStore();
const sync = useSyncStore();
const pos = usePOSStore();

const isLoading = ref(false);
const allItems = ref<any[]>([]);

const isInvoiceModalOpen = ref(false);
const selectedInvoiceItem = ref<any>(null);

function openInvoiceModal(item: any) {
  selectedInvoiceItem.value = item;
  isInvoiceModalOpen.value = true;
}

function closeInvoiceModal() {
  isInvoiceModalOpen.value = false;
  selectedInvoiceItem.value = null;
}

function handleBackdropClick() {
  if (isInvoiceModalOpen.value) return;
  emit('close');
}

const customerItems = computed(() => allItems.value.filter(i => i.action === 'save_customer'));
const invoiceItems  = computed(() => allItems.value.filter(i => i.action === 'submit_invoice'));
const totalPending  = computed(() => allItems.value.length);

const statusBarClass = computed(() => ({
  'osp-statusbar--online':  network.isOnline,
  'osp-statusbar--offline': !network.isOnline,
  'osp-statusbar--syncing': sync.isSyncing,
}));

const statusText = computed(() => {
  if (sync.isSyncing) return 'Syncing in progress…';
  if (!network.isOnline) return 'Offline — connect to sync';
  if (totalPending.value === 0) return 'Online — all synced';
  return `Online — ${totalPending.value} item(s) ready to sync`;
});

function isFailed(item: any): boolean {
  if (!item) return false;
  const id = typeof item === 'object' ? item.id : item;
  const itemObj = typeof item === 'object' ? item : allItems.value.find((i: any) => i.id === id);
  return (id in sync.failedItems) || !!(itemObj && (itemObj.sync_error || itemObj.last_error));
}

function getError(item: any): string {
  if (!item) return '';
  const id = typeof item === 'object' ? item.id : item;
  const itemObj = typeof item === 'object' ? item : allItems.value.find((i: any) => i.id === id);
  return itemObj?.sync_error || itemObj?.last_error || sync.failedItems[id] || '';
}

function isBlocked(item: any): boolean {
  return (
    item.action === 'submit_invoice' &&
    (item.payload?.invoice?.customer || '').startsWith('OFFLINE-')
  );
}

function invoiceTotal(item: any): number {
  const items: any[] = item.payload?.invoice?.items || [];
  return items.reduce((sum: number, i: any) => sum + (i.qty * i.rate || 0), 0);
}

function formatCurrency(amount: number): string {
  return globalFormatCurrency(amount, pos.session?.currency);
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit' });
}

async function loadQueue() {
  isLoading.value = true;
  try {
    allItems.value = await getSyncQueue();
  } finally {
    isLoading.value = false;
  }
}

async function manualSync() {
  if (!network.isOnline || sync.isSyncing) return;
  await sync.syncAll();
  await loadQueue(); // Refresh list after sync
}

// Reload queue whenever panel opens or sync finishes
watch(() => props.isOpen, (open) => { if (open) loadQueue(); });
watch(() => sync.isSyncing, (syncing) => { if (!syncing && props.isOpen) loadQueue(); });
</script>

<style>
/* ── Backdrop ─────────────────────────────────────────── */
.osp-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  z-index: 8000;
}
.osp-backdrop-enter-active, .osp-backdrop-leave-active { transition: opacity 0.2s ease; }
.osp-backdrop-enter-from, .osp-backdrop-leave-to { opacity: 0; }

/* ── Panel ────────────────────────────────────────────── */
.osp-panel {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: 420px;
  max-width: 95vw;
  background: var(--pos-surface, #ffffff);
  border-left: 1px solid var(--pos-border, #e2e5ef);
  box-shadow: -8px 0 48px rgba(0,0,0,0.18);
  z-index: 8001;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.osp-panel-enter-active, .osp-panel-leave-active { transition: transform 0.25s cubic-bezier(.4,0,.2,1); }
.osp-panel-enter-from, .osp-panel-leave-to { transform: translateX(100%); }

/* ── Header ───────────────────────────────────────────── */
.osp-header {
  display: flex;
  flex-direction: column;
  padding: 0;
  border-bottom: 1px solid var(--pos-border, #e2e5ef);
  flex-shrink: 0;
}

/* Back to POS button — top row */
.osp-header__back {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 16px 8px;
  border: none;
  border-bottom: 1px solid var(--pos-border, #e2e5ef);
  background: var(--pos-bg, #f7f8fc);
  color: #6366f1;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.12s, color 0.12s;
}
.osp-header__back:hover {
  background: rgba(99,102,241,0.08);
  color: #4f46e5;
}

/* Title + close row */
.osp-header__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
}

.osp-header__title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.osp-header__icon {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.osp-header__h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--pos-text, #0f1117);
}
.osp-header__sub {
  margin: 0;
  font-size: 12px;
  color: var(--pos-text-muted, #6b7280);
}
.osp-header__close {
  width: 30px; height: 30px;
  border-radius: 8px;
  border: 1px solid var(--pos-border, #e2e5ef);
  background: transparent;
  color: var(--pos-text-muted, #6b7280);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.osp-header__close:hover { background: #fee2e2; border-color: #f87171; color: #f87171; }

/* ── Status Bar ───────────────────────────────────────── */
.osp-statusbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--pos-border, #e2e5ef);
  flex-shrink: 0;
}
.osp-statusbar--online  { background: rgba(52,211,153,0.08); color: #059669; }
.osp-statusbar--offline { background: rgba(248,113,113,0.08); color: #dc2626; }
.osp-statusbar--syncing { background: rgba(99,102,241,0.08);  color: #6366f1; }
.osp-statusbar__dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
  animation: osp-pulse 2s infinite;
}
.osp-statusbar__text { flex: 1; }

/* ── Sync Button ──────────────────────────────────────── */
.osp-sync-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 7px;
  border: none;
  background: #6366f1;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.12s;
  font-family: inherit;
  flex-shrink: 0;
}
.osp-sync-btn:hover:not(:disabled) { opacity: 0.88; }
.osp-sync-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.osp-syncing-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #6366f1;
}

/* ── Error Banner ─────────────────────────────────────── */
.osp-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(239,68,68,0.08);
  border-bottom: 1px solid rgba(239,68,68,0.2);
  color: #dc2626;
  font-size: 11px;
  line-height: 1.5;
  flex-shrink: 0;
}
.osp-error svg { flex-shrink: 0; margin-top: 1px; }

/* ── Body ─────────────────────────────────────────────── */
.osp-body {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--pos-border, #e2e5ef) transparent;
  padding: 12px 0;
}

/* ── Section ──────────────────────────────────────────── */
.osp-section { margin-bottom: 6px; }
.osp-section__header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--pos-text-muted, #6b7280);
  background: var(--pos-bg, #f8f9fc);
  border-top: 1px solid var(--pos-border, #e2e5ef);
  border-bottom: 1px solid var(--pos-border, #e2e5ef);
}
.osp-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px; height: 18px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 800;
  padding: 0 5px;
}
.osp-badge--amber  { background: rgba(251,191,36,0.18); color: #b45309; }
.osp-badge--purple { background: rgba(99,102,241,0.15); color: #6366f1; }

/* ── Items ────────────────────────────────────────────── */
.osp-list { padding: 4px 0; }

/* Wrapper groups the item card + its error box */
.osp-item-wrap {
  border-bottom: 1px solid var(--pos-border, #f0f2f8);
}
.osp-item-wrap:last-child { border-bottom: none; }

.osp-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 16px;
  transition: background 0.1s;
}
.osp-item:hover { background: var(--pos-bg, #f7f8fc); }
.osp-item--error  { background: rgba(239,68,68,0.04); }
.osp-item--blocked{ background: rgba(251,191,36,0.04); }

/* Per-item error reason box */
.osp-item-error {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0 16px 10px;
  padding: 8px 10px;
  background: rgba(239,68,68,0.07);
  border: 1px solid rgba(239,68,68,0.18);
  border-radius: 7px;
  color: #dc2626;
  font-size: 11px;
  line-height: 1.5;
}
.osp-item-error--warn {
  background: rgba(251,191,36,0.08);
  border-color: rgba(251,191,36,0.25);
  color: #b45309;
}
.osp-item-error__icon { flex-shrink: 0; margin-top: 1px; }

.osp-item__avatar {
  width: 34px; height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.osp-item__avatar--invoice {
  background: linear-gradient(135deg, #6366f1, #818cf8);
  border-radius: 10px;
}

.osp-item__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.osp-item__name {
  font-size: 13px;
  font-weight: 700;
  color: var(--pos-text, #0f1117);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.osp-item__meta {
  font-size: 11px;
  color: var(--pos-text-muted, #6b7280);
}
.osp-item__temp {
  font-size: 10px;
  color: var(--pos-text-muted, #9ca3af);
  font-family: 'SF Mono', monospace;
}
.osp-item__temp--warn { color: #d97706; font-family: inherit; font-size: 10px; }

.osp-item__status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.osp-status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
}
.osp-status--pending { background: rgba(251,191,36,0.12); color: #b45309; }
.osp-status--error   { background: rgba(239,68,68,0.12);  color: #dc2626; }
.osp-status--blocked { background: rgba(107,114,128,0.1); color: #6b7280; }

.osp-item__time {
  font-size: 10px;
  color: var(--pos-text-muted, #9ca3af);
}

/* ── Empty ────────────────────────────────────────────── */
.osp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  color: var(--pos-text-muted, #6b7280);
  gap: 8px;
  text-align: center;
}
.osp-empty p { margin: 0; font-size: 15px; font-weight: 700; color: var(--pos-text, #0f1117); }
.osp-empty span { font-size: 12px; }
.osp-empty svg { color: #34d399; margin-bottom: 4px; }

/* ── Loading ──────────────────────────────────────────── */
.osp-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex: 1;
  padding: 40px;
  color: var(--pos-text-muted, #6b7280);
  font-size: 13px;
}

/* ── Footer ───────────────────────────────────────────── */
.osp-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--pos-border, #e2e5ef);
  flex-shrink: 0;
}
.osp-footer__hint {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--pos-text-muted, #9ca3af);
}

/* ── Spinner ──────────────────────────────────────────── */
.osp-spin {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid rgba(99,102,241,0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: osp-rot 0.65s linear infinite;
}
.osp-spin--lg { width: 24px; height: 24px; border-width: 3px; }

@keyframes osp-rot { to { transform: rotate(360deg); } }

/* ── View Button Inside Invoice Row ───────────────────────── */
.osp-view-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding: 3px 9px;
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
  border: 1px solid rgba(99, 102, 241, 0.22);
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.osp-view-btn:hover {
  background: #6366f1;
  color: #ffffff;
  border-color: #6366f1;
}

@keyframes osp-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.4); }
}
</style>

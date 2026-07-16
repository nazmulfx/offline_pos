<!--
  HeldInvoicesPanel.vue — Slide-in drawer showing local held/draft invoices.
  Allows resuming a draft or deleting it.
-->
<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="hip-backdrop">
      <div v-if="isOpen" class="hip-backdrop" @click="$emit('close')" />
    </Transition>

    <!-- Panel -->
    <Transition name="hip-panel">
      <div v-if="isOpen" class="hip-panel" role="dialog" aria-label="Held Invoices">

        <!-- Header -->
        <div class="hip-header">
          <!-- Back button — top left -->
          <button class="hip-header__back" @click="$emit('close')" title="Back to POS">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back to POS
          </button>

          <!-- Title + close -->
          <div class="hip-header__row">
            <div class="hip-header__title">
              <span class="hip-header__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="9" y1="9" x2="15" y2="9"/>
                  <line x1="9" y1="13" x2="15" y2="13"/>
                  <line x1="9" y1="17" x2="13" y2="17"/>
                </svg>
              </span>
              <div>
                <h2 class="hip-header__h2">Held Invoices</h2>
                <p class="hip-header__sub">{{ pos.heldInvoices.length }} draft invoice{{ pos.heldInvoices.length !== 1 ? 's' : '' }} saved</p>
              </div>
            </div>
            <button class="hip-header__close" @click="$emit('close')" title="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="hip-body">
          <div v-if="pos.heldInvoices.length > 0" class="hip-list">
            <div
              v-for="draft in pos.heldInvoices"
              :key="draft.local_id"
              class="hip-item-wrap"
            >
              <div class="hip-item" :class="{ 'hip-item--active': pos.currentDraftId === draft.local_id }">
                <div class="hip-item__avatar">
                  {{ draft.customer?.customer_name?.charAt(0)?.toUpperCase() || 'W' }}
                </div>
                <div class="hip-item__info">
                  <span class="hip-item__name">
                    {{ draft.customer?.customer_name || 'Walk-in Customer' }}
                  </span>
                  <span class="hip-item__meta">
                    {{ draft.cartItems?.length || 0 }} item(s) ·
                    {{ formatDraftCurrency(draft.grand_total) }}
                  </span>
                  <span class="hip-item__time">
                    Saved: {{ formatDateTime(draft.created_at) }}
                  </span>
                  <span v-if="pos.currentDraftId === draft.local_id" class="hip-item__active-badge">
                    Active Draft
                  </span>
                </div>
                <div class="hip-item__actions">
                  <button
                    class="hip-action-btn hip-action-btn--resume"
                    @click="handleResume(draft)"
                    title="Resume Invoice"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    Resume
                  </button>
                  <button
                    class="hip-action-btn hip-action-btn--delete"
                    @click="handleDelete(draft)"
                    title="Delete Draft"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty -->
          <div v-else class="hip-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="9" x2="15" y2="9"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="13" y2="17"/>
            </svg>
            <p>No held invoices</p>
            <span>You can hold active carts to process them later.</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="hip-footer">
          <span class="hip-footer__hint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Held invoices are saved locally and won't sync to ERPNext.
          </span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { usePOSStore } from '../../stores/posStore';
import { formatCurrency } from '../../lib/currency';

const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const pos = usePOSStore();

function formatDraftCurrency(amount: number): string {
  return formatCurrency(amount, pos.session?.currency);
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-BD', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function handleResume(draft: any) {
  if (pos.cartItems.length > 0) {
    if (!confirm('Resuming this draft will overwrite your current cart. Do you want to proceed?')) {
      return;
    }
  }
  try {
    await pos.resumeHeldInvoice(draft.local_id);
    emit('close');
  } catch (err: any) {
    pos.showAlert('Error', 'Failed to resume draft: ' + err.message, 'error');
  }
}

async function handleDelete(draft: any) {
  if (!confirm('Are you sure you want to delete this draft invoice?')) {
    return;
  }
  try {
    await pos.discardHeldInvoice(draft.local_id);
  } catch (err: any) {
    pos.showAlert('Error', 'Failed to delete draft: ' + err.message, 'error');
  }
}
</script>

<style>
/* ── Backdrop ─────────────────────────────────────────── */
.hip-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  z-index: 8000;
}
.hip-backdrop-enter-active, .hip-backdrop-leave-active { transition: opacity 0.2s ease; }
.hip-backdrop-enter-from, .hip-backdrop-leave-to { opacity: 0; }

/* ── Panel ────────────────────────────────────────────── */
.hip-panel {
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
.hip-panel-enter-active, .hip-panel-leave-active { transition: transform 0.25s cubic-bezier(.4,0,.2,1); }
.hip-panel-enter-from, .hip-panel-leave-to { transform: translateX(100%); }

/* ── Header ───────────────────────────────────────────── */
.hip-header {
  display: flex;
  flex-direction: column;
  padding: 0;
  border-bottom: 1px solid var(--pos-border, #e2e5ef);
  flex-shrink: 0;
}

/* Back to POS button — top row */
.hip-header__back {
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
.hip-header__back:hover {
  background: rgba(99,102,241,0.08);
  color: #4f46e5;
}

/* Title + close row */
.hip-header__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
}

.hip-header__title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hip-header__icon {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #6366f1, #818cf8);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.hip-header__h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--pos-text, #0f1117);
}
.hip-header__sub {
  margin: 0;
  font-size: 12px;
  color: var(--pos-text-muted, #6b7280);
}
.hip-header__close {
  width: 30px; height: 30px;
  border-radius: 8px;
  border: 1px solid var(--pos-border, #e2e5ef);
  background: transparent;
  color: var(--pos-text-muted, #6b7280);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.hip-header__close:hover { background: #fee2e2; border-color: #f87171; color: #f87171; }

/* ── Body ─────────────────────────────────────────────── */
.hip-body {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--pos-border, #e2e5ef) transparent;
  padding: 12px 0;
}

/* ── List ────────────────────────────────────────────── */
.hip-list { padding: 4px 0; }

.hip-item-wrap {
  border-bottom: 1px solid var(--pos-border, #f0f2f8);
}
.hip-item-wrap:last-child { border-bottom: none; }

.hip-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  transition: background 0.1s;
}
.hip-item:hover { background: var(--pos-bg, #f7f8fc); }
.hip-item--active { background: rgba(99,102,241,0.03); border-left: 3px solid #6366f1; padding-left: 13px; }

.hip-item__avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8b5cf6, #c084fc);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.hip-item__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.hip-item__name {
  font-size: 13px;
  font-weight: 700;
  color: var(--pos-text, #0f1117);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hip-item__meta {
  font-size: 11px;
  font-weight: 600;
  color: var(--pos-text-muted, #6b7280);
}
.hip-item__time {
  font-size: 10px;
  color: var(--pos-text-muted, #9ca3af);
}
.hip-item__active-badge {
  display: inline-flex;
  align-self: flex-start;
  background: rgba(99,102,241,0.1);
  color: #6366f1;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  margin-top: 2px;
  text-transform: uppercase;
}

.hip-item__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.hip-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--pos-border);
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  background: var(--pos-surface);
  color: var(--pos-text);
  font-family: inherit;
  transition: all 0.12s;
}

.hip-action-btn--resume {
  background: #6366f1;
  color: #fff;
  border-color: #6366f1;
}
.hip-action-btn--resume:hover {
  background: #4f46e5;
  border-color: #4f46e5;
}

.hip-action-btn--delete {
  color: var(--pos-text-muted);
}
.hip-action-btn--delete:hover {
  color: #ef4444;
  border-color: #f87171;
  background: #fee2e2;
}

/* ── Empty ────────────────────────────────────────────── */
.hip-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  color: var(--pos-text-muted, #6b7280);
  gap: 8px;
  text-align: center;
}
.hip-empty p { margin: 0; font-size: 15px; font-weight: 700; color: var(--pos-text, #0f1117); }
.hip-empty span { font-size: 12px; }
.hip-empty svg { color: var(--pos-text-muted); margin-bottom: 4px; opacity: 0.7; }

/* ── Footer ───────────────────────────────────────────── */
.hip-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--pos-border, #e2e5ef);
  flex-shrink: 0;
}
.hip-footer__hint {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--pos-text-muted, #9ca3af);
}
</style>

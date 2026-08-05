<!--
  POSAlertModal.vue — Premium custom popup alert modal
  Replaces basic browser alert dialogs with high fidelity, designed alerts.
-->
<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="pos.activeAlert" class="alert-overlay" @click.self="handleOverlayClick">
        <div class="alert-modal" :class="`alert-modal--${alertType}`">
          <div class="alert-modal__icon">
            <!-- Success icon -->
            <svg v-if="alertType === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="28" height="28">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <!-- Info icon -->
            <svg v-else-if="alertType === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="28" height="28">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <!-- Stock Alert icon -->
            <svg v-else-if="isStockAlert" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
              <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="2" />
            </svg>
            <!-- General Warning/Error icon -->
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="28" height="28">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3 class="alert-modal__title">{{ pos.activeAlert.title }}</h3>
          <p class="alert-modal__message">{{ pos.activeAlert.message }}</p>

          <div class="alert-modal__actions">
            <!-- For Invoice Submission Errors: Only single primary action button -->
            <button
              v-if="pos.activeAlert.onSaveToQueue"
              class="alert-modal__btn alert-modal__btn--save"
              :disabled="isSaving"
              @click="handleSaveToQueue"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-right: 6px;">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              <span>{{ isSaving ? 'Saving…' : (pos.activeAlert.saveToQueueText || 'Save Invoice to Sync Queue') }}</span>
            </button>

            <!-- Standard Dismiss button for general alerts -->
            <button
              v-else
              class="alert-modal__btn"
              @click="pos.closeAlert"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePOSStore } from '../../stores/posStore';
const pos = usePOSStore();
const isSaving = ref(false);

async function handleSaveToQueue() {
  if (!pos.activeAlert?.onSaveToQueue || isSaving.value) return;
  isSaving.value = true;
  try {
    await pos.activeAlert.onSaveToQueue();
    pos.closeAlert();
  } catch (err: any) {
    alert('Failed to save invoice to sync queue: ' + (err?.message || 'Unknown error'));
  } finally {
    isSaving.value = false;
  }
}

function handleOverlayClick() {
  if (pos.activeAlert?.onSaveToQueue) {
    handleSaveToQueue();
  } else {
    pos.closeAlert();
  }
}

const isStockAlert = computed(() => {
  const title = pos.activeAlert?.title || '';
  return /stock/i.test(title);
});

const alertType = computed(() => {
  if (pos.activeAlert?.type) {
    return pos.activeAlert.type;
  }
  const title = pos.activeAlert?.title || '';
  if (/success|completed|saved/i.test(title)) {
    return 'success';
  }
  if (/syncing|loading|info/i.test(title)) {
    return 'info';
  }
  return 'error';
});
</script>

<style scoped>
.alert-overlay {
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

.alert-modal {
  background: var(--pos-surface, #fff);
  border: 1px solid var(--pos-border, #e2e8f0);
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  padding: 32px 24px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.alert-modal__icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}

.alert-modal__title {
  font-size: 18px;
  font-weight: 700;
  color: var(--pos-text, #1e293b);
  margin: 0 0 10px;
}

.alert-modal__message {
  font-size: 14px;
  color: var(--pos-text-muted, #64748b);
  line-height: 1.5;
  margin: 0 0 24px;
  white-space: pre-line;
}

.alert-modal__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.alert-modal__btn {
  width: 100%;
  padding: 11px;
  border-radius: 10px;
  border: none;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.alert-modal__btn:active {
  transform: scale(0.98);
}

.alert-modal__btn--save {
  background: #2563eb !important;
  color: #ffffff !important;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25) !important;
}
.alert-modal__btn--save:hover {
  background: #1d4ed8 !important;
  transform: translateY(-1px);
}

.alert-modal__btn--secondary {
  background: #f1f5f9 !important;
  color: #475569 !important;
  box-shadow: none !important;
  border: 1px solid #cbd5e1 !important;
}
.alert-modal__btn--secondary:hover {
  background: #e2e8f0 !important;
  color: #1e293b !important;
}

/* Success Alert Styles */
.alert-modal--success .alert-modal__icon {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}
.alert-modal--success .alert-modal__btn {
  background: #22c55e;
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);
}
.alert-modal--success .alert-modal__btn:hover {
  background: #16a34a;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(34, 197, 94, 0.3);
}

/* Info Alert Styles */
.alert-modal--info .alert-modal__icon {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}
.alert-modal--info .alert-modal__btn {
  background: #3b82f6;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
}
.alert-modal--info .alert-modal__btn:hover {
  background: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.3);
}

/* Error/Warning Alert Styles (Default) */
.alert-modal--error .alert-modal__icon {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}
.alert-modal--error .alert-modal__btn {
  background: #ef4444;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
}
.alert-modal--error .alert-modal__btn:hover {
  background: #dc2626;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.3);
}

.modal-enter-active, .modal-leave-active {
  transition: all 0.25s ease;
}
.modal-enter-from, .modal-leave-to {
  opacity: 0;
}
.modal-enter-from .alert-modal, .modal-leave-to .alert-modal {
  transform: scale(0.95) translateY(12px);
}
</style>

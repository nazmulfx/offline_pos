<!--
  POSAlertModal.vue — Premium custom popup alert modal
  Replaces basic browser alert dialogs with high fidelity, designed alerts.
-->
<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="pos.activeAlert" class="alert-overlay" @click.self="pos.closeAlert">
        <div class="alert-modal">
          <div class="alert-modal__icon">
            <svg v-if="isStockAlert" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
              <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="2" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="28" height="28">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3 class="alert-modal__title">{{ pos.activeAlert.title }}</h3>
          <p class="alert-modal__message">{{ pos.activeAlert.message }}</p>
          <button class="alert-modal__btn" @click="pos.closeAlert">
            Dismiss
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { usePOSStore } from '../../stores/posStore';
const pos = usePOSStore();

const isStockAlert = computed(() => {
  const title = pos.activeAlert?.title || '';
  return /stock/i.test(title);
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
  max-width: 400px;
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
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
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
}

.alert-modal__btn {
  width: 100%;
  padding: 11px;
  border-radius: 10px;
  border: none;
  background: #ef4444;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
}

.alert-modal__btn:hover {
  background: #dc2626;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.3);
}

.alert-modal__btn:active {
  transform: scale(0.98);
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

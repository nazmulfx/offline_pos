<!--
  DuplicateItemModal.vue — Notification popup when item already exists in cart
-->
<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="pos.duplicateItemAlert" class="dup-overlay" @click.self="pos.closeDuplicateItemAlert">
        <div class="dup-modal">
          
          <!-- Close Icon -->
          <button class="dup-modal__close" @click="pos.closeDuplicateItemAlert" title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          <!-- Icon & Header -->
          <div class="dup-modal__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>

          <h3 class="dup-modal__title">This Item is already added to Cart</h3>
          <p class="dup-modal__subtitle">{{ pos.duplicateItemAlert.item.item_name }}</p>

          <!-- Rows Container -->
          <div class="dup-modal__rows-container">
            <!-- Table Header -->
            <div class="dup-modal__header-row">
              <span class="dup-modal__th dup-modal__th--row">Row ID</span>
              <span class="dup-modal__th dup-modal__th--uom">UOM</span>
              <span class="dup-modal__th dup-modal__th--qty">QTY</span>
              <span class="dup-modal__th dup-modal__th--action">Action</span>
            </div>

            <!-- Rows List -->
            <div class="dup-modal__rows">
              <div
                v-for="row in pos.duplicateItemAlert.rows"
                :key="row.idx"
                class="dup-modal__row-card"
              >
                <div class="dup-modal__col dup-modal__col--row">
                  <span class="dup-modal__row-badge">Row #{{ row.idx + 1 }}</span>
                </div>
                <div class="dup-modal__col dup-modal__col--uom">
                  <span class="dup-modal__uom-val">{{ row.uom }}</span>
                </div>
                <div class="dup-modal__col dup-modal__col--qty">
                  <span class="dup-modal__qty-val">{{ row.qty }}</span>
                </div>
                <div class="dup-modal__col dup-modal__col--action">
                  <button
                    class="dup-modal__add-btn"
                    @click="pos.addQtyToExistingRow(row.idx)"
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom Action: Add to cart again -->
          <div class="dup-modal__actions">
            <button
              class="dup-modal__again-btn"
              @click="pos.forceAddToCart(pos.duplicateItemAlert.item)"
            >
              Add to cart again
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { usePOSStore } from '../../stores/posStore';

const pos = usePOSStore();
</script>

<style scoped>
.dup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.dup-modal {
  position: relative;
  background: var(--pos-surface, #ffffff);
  border: 1px solid var(--pos-border, #e2e8f0);
  border-radius: 18px;
  width: 100%;
  max-width: 560px;
  padding: 30px 28px 24px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.dup-modal__close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: 1px solid var(--pos-border, #e2e8f0);
  border-radius: 8px;
  padding: 4px 6px;
  color: var(--pos-text-muted, #64748b);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
}

.dup-modal__close:hover {
  color: var(--pos-text, #1e293b);
  background: var(--pos-bg, #f8fafc);
}

.dup-modal__icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.dup-modal__title {
  font-size: 18px;
  font-weight: 700;
  color: var(--pos-text, #1e293b);
  margin: 0 0 6px 0;
}

.dup-modal__subtitle {
  font-size: 15px;
  font-weight: 700;
  color: var(--pos-accent, #6366f1);
  margin: 0 0 22px 0;
  word-break: break-word;
}

.dup-modal__rows-container {
  width: 100%;
  margin-bottom: 20px;
}

.dup-modal__header-row,
.dup-modal__row-card {
  display: grid;
  grid-template-columns: 100px 1fr 1fr auto;
  align-items: center;
  gap: 14px;
}

.dup-modal__header-row {
  padding: 0 16px 8px 16px;
}

.dup-modal__th {
  font-size: 11px;
  font-weight: 700;
  color: var(--pos-text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: left;
}

.dup-modal__th--action {
  text-align: right;
  padding-right: 6px;
}

.dup-modal__rows {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
  padding-right: 2px;
}

.dup-modal__row-card {
  background: var(--pos-bg, #f8fafc);
  border: 1px solid var(--pos-border, #e2e8f0);
  border-radius: 12px;
  padding: 12px 16px;
  transition: border-color 0.12s, background 0.12s;
}

.dup-modal__row-card:hover {
  border-color: var(--pos-accent, #6366f1);
}

.dup-modal__col--row {
  text-align: left;
}
.dup-modal__col--uom {
  text-align: left;
}
.dup-modal__col--qty {
  text-align: left;
}
.dup-modal__col--action {
  text-align: right;
}

.dup-modal__row-badge {
  background: var(--pos-border, #e2e8f0);
  color: var(--pos-text, #334155);
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  display: inline-block;
}

.dup-modal__uom-val {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--pos-text-muted, #64748b);
  text-transform: uppercase;
}

.dup-modal__qty-val {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--pos-text, #1e293b);
  font-variant-numeric: tabular-nums;
}

.dup-modal__add-btn {
  background: var(--pos-accent, #6366f1);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.dup-modal__add-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(99, 102, 241, 0.25);
}

.dup-modal__actions {
  width: 100%;
}

.dup-modal__again-btn {
  width: 100%;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--pos-border, #cbd5e1);
  background: var(--pos-surface, #ffffff);
  color: var(--pos-text, #1e293b);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.dup-modal__again-btn:hover {
  background: var(--pos-bg, #f1f5f9);
  border-color: var(--pos-accent, #6366f1);
  color: var(--pos-accent, #6366f1);
}

.modal-enter-active, .modal-leave-active {
  transition: all 0.2s ease;
}
.modal-enter-from, .modal-leave-to {
  opacity: 0;
}
.modal-enter-from .dup-modal, .modal-leave-to .dup-modal {
  transform: scale(0.95) translateY(10px);
}
</style>

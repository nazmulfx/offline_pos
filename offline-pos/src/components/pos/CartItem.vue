<!--
  CartItem.vue — Single row in the cart (redesigned)
-->
<template>
  <div class="ci" :class="{ 'ci--active': isActive }" @click="emit('select')">

    <!-- Row 1: Name + Remove -->
    <div class="ci__top">
      <span class="ci__name">{{ item.item_name }}</span>
      <button class="ci__remove" @click.stop="emit('remove')" title="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <!-- Row 2: Qty controls + Amount -->
    <div class="ci__bottom">
      <template v-if="item.allocations && item.allocations.length > 0">
        <div class="ci__badge-list" style="display: flex; flex-wrap: wrap; gap: 4px;">
          <span v-for="alloc in item.allocations.filter(a => a.batch_no)" :key="alloc.batch_no" class="ci__badge">
            {{ alloc.batch_no }}
            <span v-if="item.qty > alloc.qty" class="ci__badge-qty" style="font-weight: normal; opacity: 0.85; margin-left: 2px;">(x{{ alloc.qty }})</span>
          </span>
        </div>
      </template>
      <template v-else-if="item.batch_no">
        <span class="ci__badge">{{ item.batch_no }}</span>
      </template>

      <span class="ci__uom">{{ item.uom }}</span>

      <div class="ci__spacer" />

      <!-- Qty stepper -->
      <div class="ci__qty-wrap">
        <button class="ci__step" @click.stop="decrement" :disabled="item.qty <= 1">−</button>
        <span class="ci__qty">{{ item.qty }}</span>
        <button class="ci__step" @click.stop="increment">+</button>
      </div>

      <!-- Unit price × amount -->
      <div class="ci__price-wrap">
        <span class="ci__unit">{{ fmt(item.rate) }}</span>
        <span class="ci__amount">{{ fmt(item.amount) }}</span>
      </div>
    </div>

    <!-- Serials list -->
    <template v-if="item.allocations && item.allocations.length > 0">
      <div v-for="(alloc, aIdx) in item.allocations.filter(a => a.serial_no)" :key="aIdx" class="ci__serials">
        <span class="ci__serials-label">
          <span v-if="alloc.batch_no" style="color: var(--pos-text); font-weight: bold; margin-right: 4px;">[{{ alloc.batch_no }}]</span>
          Serials:
        </span>
        <span class="ci__serials-list">{{ formatAllocationSerials(alloc.serial_no) }}</span>
      </div>
    </template>
    <template v-else-if="item.serial_no">
      <div class="ci__serials">
        <span class="ci__serials-label">Serials:</span>
        <span class="ci__serials-list">{{ formattedSerials }}</span>
      </div>
    </template>

    <!-- Discount bar (shown when discount > 0) -->
    <div v-if="item.discount_percentage > 0" class="ci__disc">
      <span>{{ parseFloat(item.discount_percentage.toFixed(2)) }}% off</span>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CartItem } from '../../stores/posStore';
import { formatCurrency } from '../../lib/currency';

const props = defineProps<{
  item: CartItem;
  isActive?: boolean;
  currency?: string;
}>();

const emit = defineEmits<{
  (e: 'select'): void;
  (e: 'remove'): void;
  (e: 'update-qty', qty: number): void;
}>();

const formattedSerials = computed(() => {
  if (!props.item.serial_no) return '';
  return props.item.serial_no.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).join(', ');
});

function formatAllocationSerials(serials: string): string {
  if (!serials) return '';
  return serials.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).join(', ');
}

function increment() { emit('update-qty', props.item.qty + 1); }
function decrement() { if (props.item.qty > 1) emit('update-qty', props.item.qty - 1); }

function fmt(value: number): string {
  return formatCurrency(value, props.currency);
}
</script>

<style scoped>
.ci {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--pos-surface);
  border: 1.5px solid var(--pos-border);
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
  user-select: none;
}
.ci:hover { border-color: var(--pos-accent); }
.ci--active {
  border-color: var(--pos-accent);
  background: var(--pos-accent-light, rgba(99,102,241,0.06));
}

/* Row 1 */
.ci__top {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.ci__name {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--pos-text);
  line-height: 1.3;
  word-break: break-word;
}
.ci__remove {
  background: none;
  border: none;
  padding: 2px;
  color: var(--pos-text-muted);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  flex-shrink: 0;
  transition: color 0.1s, background 0.1s;
  margin-top: 1px;
}
.ci__remove:hover { color: var(--pos-danger, #dc2626); background: rgba(220,38,38,0.08); }

/* Row 2 */
.ci__bottom {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
}
.ci__badge {
  background: var(--pos-accent-light, rgba(99,102,241,0.1));
  color: var(--pos-accent);
  border-radius: 99px;
  padding: 1px 7px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.ci__uom {
  font-size: 11px;
  color: var(--pos-text-muted);
  white-space: nowrap;
}
.ci__spacer { flex: 1; }

/* Qty stepper */
.ci__qty-wrap {
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--pos-bg);
  border: 1px solid var(--pos-border);
  border-radius: 7px;
  overflow: hidden;
}
.ci__step {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--pos-text);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s;
  line-height: 1;
  flex-shrink: 0;
}
.ci__step:hover:not(:disabled) { background: var(--pos-accent); color: #fff; }
.ci__step:disabled { opacity: 0.3; cursor: not-allowed; }
.ci__qty {
  min-width: 28px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--pos-text);
  font-variant-numeric: tabular-nums;
  border-left: 1px solid var(--pos-border);
  border-right: 1px solid var(--pos-border);
  padding: 0 4px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Price */
.ci__price-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  min-width: 68px;
}
.ci__unit {
  font-size: 10px;
  color: var(--pos-text-muted);
  font-variant-numeric: tabular-nums;
}
.ci__amount {
  font-size: 14px;
  font-weight: 800;
  color: var(--pos-text);
  font-variant-numeric: tabular-nums;
}

/* Discount badge */
.ci__disc {
  padding: 2px 8px;
  background: rgba(22,163,74,0.09);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--pos-success, #16a34a);
  align-self: flex-start;
}

.ci__serials {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 11px;
  margin-top: 2px;
  background: var(--pos-bg);
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px dashed var(--pos-border);
}
.ci__serials-label {
  font-weight: 700;
  color: var(--pos-text-muted);
}
.ci__serials-list {
  color: var(--pos-accent);
  font-family: monospace;
  word-break: break-all;
}
</style>

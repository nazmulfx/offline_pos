<!--
  ItemCard.vue — Single product card in the item selector grid
-->
<template>
  <button class="item-card" @click="emit('select', item)" :title="item.item_name">
    <div class="item-card__img-wrap">
      <img
        v-if="!hideImages && item.item_image && !imgError"
        :src="item.item_image"
        :alt="item.item_name"
        class="item-card__img"
        loading="lazy"
        @error="imgError = true"
      />
      <div v-else class="item-card__img-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28">
          <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
          <path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/>
        </svg>
      </div>

      <div class="item-card__qty-badge item-card__qty-badge--service" v-if="!item.is_stock_item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10" class="service-icon">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span>Service</span>
      </div>
      <div class="item-card__qty-badge" v-else-if="item.actual_qty !== undefined">
        <span :class="{ 'low': item.actual_qty < 5 }">{{ item.actual_qty }}</span>
      </div>
    </div>

    <div class="item-card__body">
      <p class="item-card__name">{{ item.item_name }}</p>
      <p class="item-card__code">{{ item.item_code }}</p>
      <div class="item-card__footer">
        <span class="item-card__price">
          {{ formatCurrency(item.price_list_rate) }}
        </span>
        <span class="item-card__uom">{{ item.uom }}</span>
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePOSStore } from '../../stores/posStore';
import type { POSItem } from '../../stores/posStore';
import { formatCurrency as globalFormatCurrency } from '../../lib/currency';

const props = defineProps<{ item: POSItem; currency?: string }>();
const emit = defineEmits<{ (e: 'select', item: POSItem): void }>();
const imgError = ref(false);

const pos = usePOSStore();
const hideImages = computed(() => !!pos.session?.hide_images);

function formatCurrency(value: number | undefined): string {
  return globalFormatCurrency(value, props.currency);
}
</script>

<style scoped>
.item-card {
  position: relative;
  background: var(--pos-surface);
  border: 1px solid var(--pos-border);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.18s ease;
  text-align: left;
  padding: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}
.item-card--no-image {
  min-height: 96px;
}
.item-card:hover {
  border-color: var(--pos-accent);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.15);
}
.item-card:active {
  transform: scale(0.98);
}
.item-card__img-wrap {
  position: relative;
  aspect-ratio: 1;
  background: var(--pos-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.item-card__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 8px;
}
.item-card__img-placeholder {
  color: var(--pos-text-muted);
  opacity: 0.4;
}
.item-card__qty-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: var(--pos-surface);
  border: 1px solid var(--pos-border);
  border-radius: 20px;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 700;
  color: var(--pos-text-muted);
}
.item-card__qty-badge .low {
  color: #f87171;
}
.item-card__qty-badge--service {
  background: rgba(99, 102, 241, 0.12);
  border-color: rgba(99, 102, 241, 0.3);
  color: var(--pos-accent, #6366f1);
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
}
.service-icon {
  flex-shrink: 0;
}
.item-card__body {
  padding: 10px 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.item-card__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--pos-text);
  margin: 0;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.item-card__code {
  font-size: 11px;
  color: var(--pos-text-muted);
  margin: 0;
  font-family: monospace;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.item-card__footer {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 6px;
}
.item-card__price {
  font-size: 15px;
  font-weight: 700;
  color: var(--pos-accent);
}
.item-card__uom {
  font-size: 10px;
  color: var(--pos-text-muted);
  text-transform: uppercase;
  font-weight: 600;
}
</style>

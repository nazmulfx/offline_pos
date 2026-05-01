<!--
  ItemSelector.vue — Left panel: search + item group tabs + item grid
-->
<template>
  <div class="item-selector">
    <!-- Search Bar -->
    <div class="item-selector__search">
      <span class="item-selector__search-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </span>
      <input
        ref="searchInput"
        v-model="localSearch"
        type="text"
        placeholder="Search items or scan barcode..."
        class="item-selector__search-input"
        @input="onSearch"
        @keydown.enter="onBarcodeEnter"
      />
      <button v-if="localSearch" class="item-selector__clear" @click="clearSearch">✕</button>
    </div>

    <!-- Item Groups Tabs -->
    <div class="item-selector__groups" v-if="pos.itemGroups.length > 1">
      <button
        v-for="group in pos.itemGroups"
        :key="group"
        class="item-selector__group-btn"
        :class="{ active: pos.selectedGroup === group }"
        @click="pos.filterByGroup(group)"
      >{{ group }}</button>
    </div>

    <!-- Items Grid -->
    <div class="item-selector__grid-wrap" ref="gridWrap" @scroll="onScroll">
      <!-- Loading skeleton -->
      <div v-if="pos.itemsLoading && pos.items.length === 0" class="item-selector__grid">
        <div v-for="n in 12" :key="n" class="item-card-skeleton"></div>
      </div>

      <!-- Items -->
      <div v-else-if="pos.items.length > 0" class="item-selector__grid">
        <ItemCard
          v-for="item in pos.items"
          :key="`${item.item_code}-${item.batch_no}`"
          :item="item"
          :currency="pos.session?.currency"
          @select="onItemSelect"
        />
        <!-- Infinite scroll sentinel -->
        <div v-if="pos.itemsLoading" class="item-selector__loading-more">
          <span class="spinner"></span>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="item-selector__empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
        <p>No items found</p>
        <span v-if="localSearch">Try a different search term</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { usePOSStore } from '../../stores/posStore';
import { useNetworkStore } from '../../stores/networkStore';
import { fetchItemByBarcode } from '../../services/itemService';
import ItemCard from './ItemCard.vue';
import type { POSItem } from '../../stores/posStore';

const pos = usePOSStore();
const network = useNetworkStore();

const searchInput = ref<HTMLInputElement | null>(null);
const gridWrap = ref<HTMLElement | null>(null);
const localSearch = ref('');
let searchTimer: ReturnType<typeof setTimeout>;

function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    pos.searchItems(localSearch.value);
  }, 350);
}

function clearSearch() {
  localSearch.value = '';
  pos.searchItems('');
  searchInput.value?.focus();
}

async function onBarcodeEnter() {
  // If search looks like a barcode (no spaces, short), try barcode lookup first
  const term = localSearch.value.trim();
  if (!term) return;
  const item = await fetchItemByBarcode(
    term,
    pos.session?.price_list || '',
    pos.session?.warehouse || '',
    network.isOnline
  );
  if (item) {
    onItemSelect(item);
    clearSearch();
  }
}

function onItemSelect(item: POSItem) {
  pos.addToCart(item);
}

// Infinite scroll
function onScroll() {
  const el = gridWrap.value;
  if (!el) return;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
    pos.loadItems(false);
  }
}

onMounted(() => {
  searchInput.value?.focus();
});
</script>

<style scoped>
.item-selector {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  gap: 10px;
}
.item-selector__search {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--pos-surface);
  border: 1px solid var(--pos-border);
  border-radius: 10px;
  padding: 0 12px;
  transition: border-color 0.15s;
}
.item-selector__search:focus-within {
  border-color: var(--pos-accent);
  box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
}
.item-selector__search-icon {
  color: var(--pos-text-muted);
  display: flex;
  align-items: center;
  margin-right: 8px;
}
.item-selector__search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--pos-text);
  font-size: 14px;
  padding: 11px 0;
  font-family: inherit;
}
.item-selector__search-input::placeholder {
  color: var(--pos-text-muted);
}
.item-selector__clear {
  background: none;
  border: none;
  color: var(--pos-text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
  border-radius: 4px;
}
.item-selector__clear:hover {
  color: var(--pos-text);
  background: var(--pos-surface-hover);
}
.item-selector__groups {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}
.item-selector__groups::-webkit-scrollbar { display: none; }
.item-selector__group-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--pos-border);
  background: transparent;
  color: var(--pos-text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.item-selector__group-btn.active {
  background: var(--pos-accent);
  color: #fff;
  border-color: var(--pos-accent);
}
.item-selector__grid-wrap {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--pos-border) transparent;
}
.item-selector__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  padding: 2px;
}
.item-card-skeleton {
  border-radius: 12px;
  background: var(--pos-surface);
  border: 1px solid var(--pos-border);
  aspect-ratio: 0.85;
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.item-selector__loading-more {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  padding: 16px;
}
.item-selector__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 200px;
  color: var(--pos-text-muted);
}
.item-selector__empty p {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}
.item-selector__empty span {
  font-size: 13px;
}
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--pos-border);
  border-top-color: var(--pos-accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>

<!--
  CustomerSelector.vue — Search + select or create customer
  Dropdown uses Teleport to body to avoid overflow:hidden clipping
-->
<template>
  <div class="cs" :class="{ open: isOpen }" ref="triggerRef">
    <!-- Trigger -->
    <div class="cs__trigger" @click="toggleOpen">
      <svg class="cs__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <span v-if="pos.selectedCustomer" class="cs__selected">{{ pos.selectedCustomer.customer_name }}</span>
      <span v-else class="cs__placeholder">Select Customer</span>
      <button v-if="pos.selectedCustomer" class="cs__deselect" @click.stop="pos.selectCustomer(null as any)" title="Clear">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <svg v-else class="cs__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
        <polyline :points="isOpen ? '18 15 12 9 6 15' : '6 9 12 15 18 9'"/>
      </svg>
    </div>

    <!-- Dropdown rendered at body level to escape overflow:hidden -->
    <Teleport to="body">
      <Transition name="cs-drop">
        <div
          v-if="isOpen"
          class="cs__dropdown"
          :style="dropStyle"
          @click.stop
        >
          <!-- Search -->
          <div class="cs__search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" class="cs__search-ico">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref="searchInput"
              v-model="search"
              type="text"
              placeholder="Search by name or phone…"
              class="cs__search-input"
              @input="onSearch"
            />
          </div>

          <!-- List -->
          <div class="cs__list" v-if="!pos.customersLoading">
            <button
              v-for="customer in pos.customers"
              :key="customer.name"
              class="cs__item"
              :class="{ active: pos.selectedCustomer?.name === customer.name }"
              @click="selectCustomer(customer)"
            >
              <span class="cs__avatar">{{ customer.customer_name?.charAt(0)?.toUpperCase() }}</span>
              <span class="cs__info">
                <span class="cs__cname">{{ customer.customer_name }}</span>
                <span class="cs__cphone">{{ customer.mobile_no || customer.email_id || customer.name }}</span>
              </span>
              <svg v-if="pos.selectedCustomer?.name === customer.name" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14" class="cs__check">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </button>
            <div v-if="pos.customers.length === 0" class="cs__empty">No customers found</div>
          </div>
          <div v-else class="cs__loading">
            <span class="cs__spin"></span> Searching…
          </div>

          <!-- Footer -->
          <div class="cs__footer">
            <button class="cs__new-btn" @click="showCreate = !showCreate">
              {{ showCreate ? '− Cancel' : '+ New Customer' }}
            </button>
          </div>

          <!-- Create form -->
          <Transition name="cs-slide">
            <div v-if="showCreate" class="cs__form">
              <input v-model="newName" type="text" placeholder="Full Name *" class="cs__input" />
              <input v-model="newPhone" type="tel" placeholder="Mobile No" class="cs__input" />
              <input v-model="newEmail" type="email" placeholder="Email" class="cs__input" />
              <button class="cs__save" :disabled="!newName.trim() || isSaving" @click="createCustomer">
                {{ isSaving ? 'Saving…' : 'Save Customer' }}
              </button>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount, computed } from 'vue';
import { usePOSStore } from '../../stores/posStore';
import { createCustomer as apiCreateCustomer } from '../../services/customerService';
import type { Customer } from '../../stores/posStore';

const pos = usePOSStore();
const isOpen = ref(false);
const search = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);
const showCreate = ref(false);
const isSaving = ref(false);
const newName = ref('');
const newPhone = ref('');
const newEmail = ref('');
const triggerRect = ref<DOMRect | null>(null);

let searchTimer: ReturnType<typeof setTimeout>;

const dropStyle = computed(() => {
  const r = triggerRect.value;
  if (!r) return {};
  return {
    position: 'fixed' as const,
    top: `${r.bottom + 4}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
    zIndex: 99999,
  };
});

async function toggleOpen() {
  if (isOpen.value) { isOpen.value = false; return; }
  if (triggerRef.value) triggerRect.value = triggerRef.value.getBoundingClientRect();
  isOpen.value = true;
  await nextTick();
  searchInput.value?.focus();
  pos.loadCustomers('');
}

function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => pos.loadCustomers(search.value), 300);
}

function selectCustomer(customer: Customer) {
  pos.selectCustomer(customer);
  isOpen.value = false;
  showCreate.value = false;
}

async function createCustomer() {
  if (!newName.value.trim() || isSaving.value) return;
  isSaving.value = true;
  try {
    const customer = await apiCreateCustomer({
      customer_name: newName.value.trim(),
      mobile_no: newPhone.value.trim(),
      email_id: newEmail.value.trim(),
    });
    await pos.loadCustomers('');
    pos.selectCustomer(customer);
    newName.value = ''; newPhone.value = ''; newEmail.value = '';
    showCreate.value = false;
    isOpen.value = false;
  } catch (err) {
    console.error('[CustomerSelector] Create error:', err);
  } finally {
    isSaving.value = false;
  }
}

function onOutsideClick(e: MouseEvent) {
  const target = e.target as Node;
  const dropdown = document.querySelector('.cs__dropdown');
  if (
    triggerRef.value && !triggerRef.value.contains(target) &&
    dropdown && !dropdown.contains(target)
  ) {
    isOpen.value = false;
  }
}

function updateRect() {
  if (isOpen.value && triggerRef.value) triggerRect.value = triggerRef.value.getBoundingClientRect();
}

onMounted(() => {
  document.addEventListener('mousedown', onOutsideClick);
  window.addEventListener('scroll', updateRect, true);
  window.addEventListener('resize', updateRect);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onOutsideClick);
  window.removeEventListener('scroll', updateRect, true);
  window.removeEventListener('resize', updateRect);
});
</script>

<style scoped>
.cs { position: relative; width: 100%; }
.cs__trigger {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  background: var(--pos-bg, #f0f2f8);
  border: 1px solid var(--pos-border, #e2e5ef);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.12s;
  min-height: 36px;
}
.cs.open .cs__trigger,
.cs__trigger:hover { border-color: var(--pos-accent, #6366f1); }
.cs__icon { color: var(--pos-text-muted, #6b7280); flex-shrink: 0; }
.cs__selected { font-size: 12px; font-weight: 600; color: var(--pos-text, #0f1117); flex: 1; }
.cs__placeholder { font-size: 12px; color: var(--pos-text-muted, #9ca3af); flex: 1; }
.cs__arrow { color: var(--pos-text-muted, #9ca3af); flex-shrink: 0; }
.cs__deselect {
  background: none; border: none;
  color: var(--pos-text-muted, #9ca3af);
  cursor: pointer; padding: 2px;
  border-radius: 3px; display: flex;
  transition: color 0.1s;
}
.cs__deselect:hover { color: #dc2626; }
</style>

<style>
/* ─── Dropdown (global — renders in body via Teleport) ─── */
.cs__dropdown {
  background: #ffffff !important;
  border: 1px solid #e2e5ef;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
  overflow: hidden;
  max-height: 420px;
  display: flex;
  flex-direction: column;
}
.cs__search-wrap {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border-bottom: 1px solid #e2e5ef;
  background: #f7f8fc;
}
.cs__search-ico { color: #9ca3af; flex-shrink: 0; }
.cs__search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #0f1117;
  font-size: 12px;
  font-family: inherit;
}
.cs__search-input::placeholder { color: #9ca3af; }
.cs__list {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #e2e5ef transparent;
  max-height: 220px;
}
.cs__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  background: none;
  border: none;
  border-bottom: 1px solid #f0f2f8;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.cs__item:last-child { border-bottom: none; }
.cs__item:hover { background: #f7f8fc; }
.cs__item.active { background: rgba(99,102,241,0.08); }
.cs__avatar {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: #6366f1;
  color: #fff;
  font-weight: 700; font-size: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.cs__info { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cs__cname { font-size: 12px; font-weight: 600; color: #0f1117; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cs__cphone { font-size: 10px; color: #6b7280; }
.cs__check { color: #6366f1; flex-shrink: 0; }
.cs__empty { padding: 14px; text-align: center; font-size: 12px; color: #9ca3af; }
.cs__loading { padding: 14px; display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 12px; color: #6b7280; }
.cs__spin {
  width: 14px; height: 14px;
  border: 2px solid #e2e5ef;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: cs-rot 0.6s linear infinite;
  display: inline-block;
}
.cs__footer { padding: 7px 10px; border-top: 1px solid #e2e5ef; background: #f7f8fc; }
.cs__new-btn {
  width: 100%;
  padding: 6px;
  border-radius: 6px;
  border: 1px dashed #6366f1;
  background: transparent;
  color: #6366f1;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.1s;
  font-family: inherit;
}
.cs__new-btn:hover { background: rgba(99,102,241,0.07); }
.cs__form {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid #e2e5ef;
  background: #fff;
}
.cs__input {
  width: 100%;
  background: #f7f8fc;
  border: 1px solid #e2e5ef;
  border-radius: 6px;
  padding: 7px 10px;
  color: #0f1117;
  font-size: 12px;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}
.cs__input:focus { border-color: #6366f1; }
.cs__save {
  padding: 7px;
  border-radius: 6px;
  border: none;
  background: #6366f1;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.1s;
}
.cs__save:disabled { opacity: 0.35; cursor: not-allowed; }
.cs__save:hover:not(:disabled) { opacity: 0.85; }

.cs-drop-enter-active, .cs-drop-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.cs-drop-enter-from, .cs-drop-leave-to { opacity: 0; transform: translateY(-6px); }
.cs-slide-enter-active, .cs-slide-leave-active { transition: all 0.15s ease; overflow: hidden; max-height: 200px; }
.cs-slide-enter-from, .cs-slide-leave-to { opacity: 0; max-height: 0; }
@keyframes cs-rot { to { transform: rotate(360deg); } }
</style>

<!--
  POSView.vue — Main POS terminal: Item Selector | Cart | Payment Modal
-->
<template>
  <div class="pos-view" v-if="pos.session">
    <!-- Top Bar -->
    <header class="pos-topbar">
      <div class="pos-topbar__left">
        <div class="pos-topbar__logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
        </div>
        <div class="pos-topbar__info">
          <span class="pos-topbar__profile">{{ pos.session.pos_profile }}</span>
          <span class="pos-topbar__company">{{ pos.session.company }}</span>
        </div>
      </div>

      <div class="pos-topbar__center">
        <span class="pos-topbar__time">{{ currentTime }}</span>
      </div>

      <div class="pos-topbar__right">
        <!-- Sync indicator — clickable to open the sync panel -->
        <div
          class="pos-topbar__sync"
          v-if="sync.pendingCount > 0 || sync.isSyncing"
          @click="showSyncPanel = true"
          role="button"
          title="View offline queue"
        >
          <span class="pos-topbar__sync-icon" :class="{ syncing: sync.isSyncing }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </span>
          <span class="pos-topbar__sync-count">{{ sync.pendingCount }}</span>
        </div>

        <!-- Network status -->
        <div class="pos-topbar__network" :class="{ offline: !network.isOnline }">
          <span class="pos-topbar__network-dot"></span>
          {{ network.isOnline ? 'Online' : 'Offline' }}
        </div>

        <!-- Theme Toggle -->
        <button class="pos-topbar__theme-btn" @click="toggleTheme" :title="isDark ? 'Switch to Light' : 'Switch to Dark'">
          <!-- Moon icon (dark mode) -->
          <svg v-if="!isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
          <!-- Sun icon (light mode) -->
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        </button>

        <!-- Close POS -->
        <button class="pos-topbar__close-btn" @click="confirmClose" title="Close POS">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Close POS
        </button>

        <!-- Logout — only shown when online to prevent auth issues during sync -->
        <button
          v-if="network.isOnline"
          class="pos-topbar__logout-btn"
          @click="handleLogout"
          :disabled="isLoggingOut"
          title="Sign Out"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
            <path d="M17 16l4-4m0 0l-4-4m4 4H7"/>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          </svg>
          {{ isLoggingOut ? '...' : 'Logout' }}
        </button>
      </div>
    </header>

    <!-- Offline Banner -->
    <OfflineBanner />

    <!-- Main Layout -->
    <div class="pos-main">
      <!-- Left: Item Selector -->
      <div class="pos-main__items">
        <ItemSelector />
      </div>

      <!-- Right: Cart -->
      <div class="pos-main__cart">
        <Cart @checkout="showPayment = true" />
      </div>
    </div>

    <!-- Payment Modal -->
    <PaymentModal
      :is-open="showPayment"
      @close="showPayment = false"
      @success="onPaymentSuccess"
    />

    <!-- POS Closing Modal -->
    <POSClosingModal
      :is-open="showClosing"
      @close="showClosing = false"
      @closed="onPOSClosed"
    />

    <!-- Offline Sync Panel -->
    <OfflineSyncPanel :is-open="showSyncPanel" @close="showSyncPanel = false" />

    <!-- Success Toast -->
    <Transition name="toast">
      <div v-if="successToast" class="pos-toast" :class="{ offline: successToast.offline }">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <div class="pos-toast__content">
          <span class="pos-toast__title">
            {{ successToast.offline ? 'Invoice Saved (Offline)' : 'Invoice Submitted!' }}
          </span>
          <span class="pos-toast__name">{{ successToast.name }}</span>
        </div>
      </div>
    </Transition>

    <!-- Closed Toast -->
    <Transition name="toast">
      <div v-if="closedToast" class="pos-toast pos-toast--closed">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <div class="pos-toast__content">
          <span class="pos-toast__title">POS Closed Successfully</span>
          <span class="pos-toast__name">{{ closedToast }}</span>
        </div>
      </div>
    </Transition>
  </div>

  <!-- No session — redirect to opening -->
  <div v-else class="pos-no-session">
    <p>No active POS session.</p>
    <button @click="router.push({ name: 'POSOpening' })">Open POS</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRouter } from 'vue-router';
import { usePOSStore } from '../stores/posStore';
import { useNetworkStore } from '../stores/networkStore';
import { useSyncStore } from '../stores/syncStore';
import { useTheme } from '../composables/useTheme';
import OfflineBanner from '../components/pos/OfflineBanner.vue';
import ItemSelector from '../components/pos/ItemSelector.vue';
import Cart from '../components/pos/Cart.vue';
import PaymentModal from '../components/pos/PaymentModal.vue';
import POSClosingModal from '../components/pos/POSClosingModal.vue';
import OfflineSyncPanel from '../components/pos/OfflineSyncPanel.vue';

const router = useRouter();
const pos = usePOSStore();
const network = useNetworkStore();
const sync = useSyncStore();
const { isDark, toggleTheme } = useTheme();

const showPayment = ref(false);
const showClosing = ref(false);
const showSyncPanel = ref(false);
const successToast = ref<{ name: string; offline: boolean } | null>(null);
const closedToast = ref<string | null>(null);
const isLoggingOut = ref(false);
const $auth = inject<any>('$auth');
const currentTime = ref('');

let clockTimer: ReturnType<typeof setInterval>;

// ─── Offline reload guard ─────────────────────────────────────────────────────
// Prevents accidental browser reload/close when offline to avoid IndexedDB data loss.
function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (!network.isOnline || sync.pendingCount > 0) {
    e.preventDefault();
    // Modern browsers show a generic message; the string is ignored.
    e.returnValue = 'You have unsynced data. Reload will lose offline invoices and customers. Are you sure?';
    return e.returnValue;
  }
}

onMounted(() => {
  if (!pos.session) {
    router.replace({ name: 'POSOpening' });
    return;
  }
  updateClock();
  clockTimer = setInterval(updateClock, 1000);
  sync.refreshPendingCount();
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onBeforeUnmount(() => {
  clearInterval(clockTimer);
  window.removeEventListener('beforeunload', handleBeforeUnload);
});

function updateClock() {
  currentTime.value = new Date().toLocaleTimeString('en-BD', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function onPaymentSuccess(invoiceName: string, offline: boolean) {
  successToast.value = { name: invoiceName, offline };
  setTimeout(() => { successToast.value = null; }, 5000);
}

function confirmClose() {
  if (pos.cartItems.length > 0) {
    if (!confirm('There are items in the cart. Proceed to close POS?')) return;
  }
  if (sync.pendingCount > 0) {
    if (!confirm(`There are ${sync.pendingCount} unsynced invoices. They will sync when online. Proceed to close?`)) return;
  }
  showClosing.value = true;
}

function onPOSClosed(closingName: string) {
  closedToast.value = closingName;
  setTimeout(() => {
    closedToast.value = null;
    router.push({ name: 'POSOpening' });
  }, 2500);
}

async function handleLogout() {
  if (isLoggingOut.value) return;
  if (pos.cartItems.length > 0) {
    if (!confirm('There are items in the cart. Sign out anyway?')) return;
  }
  isLoggingOut.value = true;
  try {
    await $auth.logout();
  } catch {
    window.location.href = '/login';
  } finally {
    isLoggingOut.value = false;
  }
}
</script>

<style scoped>
.pos-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--pos-bg);
  overflow: hidden;
}
/* ─── Top Bar ──────────────────────────────────────────────── */
.pos-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 56px;
  background: var(--pos-surface);
  border-bottom: 1px solid var(--pos-border);
  flex-shrink: 0;
  gap: 16px;
}
.pos-topbar__left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.pos-topbar__logo {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.pos-topbar__info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pos-topbar__profile {
  font-size: 13px;
  font-weight: 700;
  color: var(--pos-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pos-topbar__company { font-size: 11px; color: var(--pos-text-muted); }
.pos-topbar__center {
  font-size: 18px;
  font-weight: 700;
  color: var(--pos-text);
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', 'Fira Code', monospace;
  flex-shrink: 0;
}
.pos-topbar__right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  justify-content: flex-end;
}
.pos-topbar__sync {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(251,191,36,0.12);
  border: 1px solid rgba(251,191,36,0.3);
  border-radius: 20px;
  padding: 4px 10px;
  color: #fbbf24;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  user-select: none;
}
.pos-topbar__sync:hover {
  background: rgba(251,191,36,0.22);
  border-color: rgba(251,191,36,0.5);
}
.pos-topbar__sync-icon { display: flex; }
.pos-topbar__sync-icon.syncing svg { animation: spin 0.8s linear infinite; }
.pos-topbar__network {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #34d399;
  padding: 4px 10px;
  border-radius: 20px;
  background: rgba(52,211,153,0.1);
  border: 1px solid rgba(52,211,153,0.2);
}
.pos-topbar__network.offline {
  color: #f87171;
  background: rgba(248,113,113,0.1);
  border-color: rgba(248,113,113,0.2);
}
.pos-topbar__network-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2s infinite;
}
.pos-topbar__theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px; height: 32px;
  border-radius: var(--pos-radius-sm, 6px);
  border: 1px solid var(--pos-border);
  background: transparent;
  color: var(--pos-text-muted);
  cursor: pointer;
  transition: all 0.12s;
  flex-shrink: 0;
}
.pos-topbar__theme-btn:hover {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: var(--accent);
}
.pos-topbar__close-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid var(--pos-border);
  background: transparent;
  color: var(--pos-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.pos-topbar__close-btn:hover {
  border-color: #f87171;
  color: #f87171;
  background: rgba(248,113,113,0.08);
}
.pos-topbar__logout-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid var(--pos-border);
  background: transparent;
  color: var(--pos-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.pos-topbar__logout-btn:hover:not(:disabled) {
  border-color: #f87171;
  color: #f87171;
  background: rgba(248,113,113,0.08);
}
.pos-topbar__logout-btn:disabled { opacity: 0.4; cursor: not-allowed; }
/* ─── Main Layout ────────────────────────────────────────── */
.pos-main {
  display: grid;
  grid-template-columns: 1fr 360px;
  flex: 1;
  overflow: hidden;
}
.pos-main__items {
  padding: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.pos-main__cart {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
/* ─── No Session ─────────────────────────────────────────── */
.pos-no-session {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 16px;
  color: var(--pos-text-muted);
}
.pos-no-session button {
  padding: 12px 24px;
  border-radius: 10px;
  border: none;
  background: var(--pos-accent);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
/* ─── Toast ─────────────────────────────────────────────── */
.pos-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: linear-gradient(135deg, #059669, #34d399);
  color: #fff;
  border-radius: 14px;
  padding: 14px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 8px 32px rgba(5,150,105,0.4);
  z-index: 600;
  max-width: 340px;
}
.pos-toast.offline {
  background: linear-gradient(135deg, #d97706, #fbbf24);
  box-shadow: 0 8px 32px rgba(217,119,6,0.4);
}
.pos-toast__content { display: flex; flex-direction: column; gap: 2px; }
.pos-toast__title { font-size: 14px; font-weight: 800; }
.pos-toast__name { font-size: 12px; opacity: 0.9; }
.pos-toast--closed {
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  box-shadow: 0 8px 32px rgba(59,130,246,0.4);
}
.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(20px) scale(0.95); }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}
</style>

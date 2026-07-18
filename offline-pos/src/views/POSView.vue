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

        <!-- Network status -->
        <div class="pos-topbar__network" :class="{ offline: !network.isOnline }">
          <span class="pos-topbar__network-dot"></span>
          {{ network.isOnline ? 'Online' : 'Offline' }}
        </div>

        <!-- Forced Offline Toggle -->
        <label class="pos-topbar__forced-offline" title="Force system into offline mode">
          <span class="pos-topbar__forced-offline-switch">
            <input type="checkbox" v-model="network.isForcedOffline" />
            <span class="pos-topbar__forced-offline-slider"></span>
          </span>
          <span class="pos-topbar__forced-offline-label">Offline Mode</span>
        </label>
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

        <!-- Held Invoices Toggle -->
        <button
          class="pos-topbar__held-btn"
          @click="showHeldPanel = true"
          title="View held/draft invoices"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="9" x2="15" y2="9"/>
            <line x1="9" y1="13" x2="15" y2="13"/>
            <line x1="9" y1="17" x2="13" y2="17"/>
          </svg>
          Held Invoices
          <span v-if="pos.heldInvoices.length > 0" class="pos-topbar__held-count">
            {{ pos.heldInvoices.length }}
          </span>
        </button>

        <!-- Sync with Server -->
        <button
          class="pos-topbar__refresh-btn"
          @click="manualDataRefresh"
          :disabled="isRefreshingData || sync.isSyncing"
          title="Sync offline transactions and refresh data from server"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            width="14"
            height="14"
            :class="{ downloading: isRefreshingData || sync.isSyncing }"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {{ (isRefreshingData || sync.isSyncing) ? 'Updating...' : 'Update from Server' }}
        </button>

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
    <div class="pos-main" :class="{ 'pos-main--details-open': pos.selectedCartItem }">
      <!-- Left: Item Selector -->
      <div class="pos-main__items">
        <ItemSelector />
      </div>

      <!-- Middle: Item Details -->
      <div v-if="pos.selectedCartItem" class="pos-main__details">
        <ItemDetails />
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

    <!-- Held Invoices Panel -->
    <HeldInvoicesPanel :is-open="showHeldPanel" @close="showHeldPanel = false" />

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

    <!-- Print Format Choice Dialog (only when print_mode is 'POS and Standard') -->
    <Transition name="fade">
      <div v-if="showPrintChoiceModal" class="pos-print-choice-overlay">
        <div class="pos-print-choice-card">
          <div class="pos-print-choice-header">
            <div class="pos-print-choice-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
            </div>
            <h3>Print Invoice</h3>
            <p>Select which format you would like to print for this transaction.</p>
          </div>
          <div class="pos-print-choice-body">
            <button 
              class="pos-print-choice-btn pos-print-choice-btn--pos"
              @click="handlePrintChoice('POS')"
            >
              <span class="btn-icon">🧾</span>
              <span class="btn-title">POS Receipt</span>
              <span class="btn-subtitle">Format: {{ pos.session?.print_format || 'POS print format' }}</span>
            </button>
            <button 
              class="pos-print-choice-btn pos-print-choice-btn--standard"
              @click="handlePrintChoice('Standard')"
            >
              <span class="btn-icon">📄</span>
              <span class="btn-title">Standard Invoice</span>
              <span class="btn-subtitle">Format: {{ pos.session?.standard_print_format || 'Standard print format' }}</span>
            </button>
          </div>
          <div class="pos-print-choice-footer">
            <button class="pos-print-choice-cancel-btn" @click="cancelPrintChoice">Close without printing</button>
          </div>
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
import { ref, onMounted, onBeforeUnmount, inject, watch } from 'vue';
import { useRouter } from 'vue-router';
import { usePOSStore } from '../stores/posStore';
import { useNetworkStore } from '../stores/networkStore';
import { useSyncStore } from '../stores/syncStore';
import { useTheme } from '../composables/useTheme';
import OfflineBanner from '../components/pos/OfflineBanner.vue';
import ItemSelector from '../components/pos/ItemSelector.vue';
import Cart from '../components/pos/Cart.vue';
import ItemDetails from '../components/pos/ItemDetails.vue';
import PaymentModal from '../components/pos/PaymentModal.vue';
import POSClosingModal from '../components/pos/POSClosingModal.vue';
import OfflineSyncPanel from '../components/pos/OfflineSyncPanel.vue';
import HeldInvoicesPanel from '../components/pos/HeldInvoicesPanel.vue';
import { getPOSProfileData, printInvoiceOffline, checkOpeningEntry } from '../services/invoiceService';

const router = useRouter();
const pos = usePOSStore();
const network = useNetworkStore();
const sync = useSyncStore();
const { isDark, toggleTheme } = useTheme();

const showPayment = ref(false);
const showClosing = ref(false);
const showSyncPanel = ref(false);
const showHeldPanel = ref(false);
const successToast = ref<{ name: string; offline: boolean } | null>(null);
const showPrintChoiceModal = ref(false);
const printChoiceDoc = ref<any>(null);
const printChoiceInvoiceName = ref('');
const printChoiceOffline = ref(false);
const printChoicePreOpenedWindow = ref<Window | null>(null);
const closedToast = ref<string | null>(null);
const isLoggingOut = ref(false);
const $auth = inject<any>('$auth');
const currentTime = ref('');

const isRefreshingData = ref(false);

async function manualDataRefresh() {
  if (isRefreshingData.value || sync.isSyncing) return;
  isRefreshingData.value = true;
  
  // Save original forced offline state
  const originalForcedOffline = network.isForcedOffline;
  
  try {
    pos.showAlert('Syncing Data', 'Verifying connection to the server...', 'info');
    
    // 1. Test actual physical connection
    const physicallyConnected = await network.testPhysicalConnection();
    if (!physicallyConnected) {
      pos.showAlert('Sync Error', 'Cannot sync. The ERPNext server is unreachable. Please check your internet connection.', 'error');
      return;
    }

    // 2. Temporarily disable forced offline mode to allow online API calls
    network.isForcedOffline = false;
    await network.checkConnectivity();

    pos.showAlert('Syncing Data', 'Syncing offline transactions and updating local catalog from the server...', 'info');
    
    // 3. Upload offline queue
    const syncResult = await sync.syncAll();
    
    // 4. Download latest items/customers
    await Promise.all([
      pos.loadItems(true),
      pos.loadCustomers(''),
      pos.refreshSerialBatchDataFromServer()
    ]);
    
    pos.prefetchAllItems();
    pos.prefetchAllCustomers();
    
    // Construct rich detailed message showing exactly what was synchronized
    let msg = 'POS catalog and customer data are fully synchronized!';
    if (syncResult) {
      const parts: string[] = [];
      if (syncResult.invoices > 0) {
        parts.push(`${syncResult.invoices} invoice(s)`);
      }
      if (syncResult.customers > 0) {
        parts.push(`${syncResult.customers} customer(s)`);
      }
      if (syncResult.others > 0) {
        parts.push(`${syncResult.others} other record(s)`);
      }
      if (parts.length > 0) {
        msg = `Successfully synchronized: ${parts.join(', ')}. Local catalog, pricing, and customer details have been fully updated!`;
      } else {
        msg = 'No pending offline transactions to sync. Local catalog, pricing, and customer details have been fully updated from the server!';
      }
      if (syncResult.errorCount > 0) {
        msg += ` Note: ${syncResult.errorCount} sync item(s) failed.`;
      }
    }
    
    pos.showAlert('Sync Success', msg, 'success');
  } catch (err) {
    console.error('[POSView] manualDataRefresh error:', err);
    pos.showAlert('Sync Error', 'Failed to complete synchronization with the server. Please check your internet connection.', 'error');
  } finally {
    // 5. Restore original forced offline state
    network.isForcedOffline = originalForcedOffline;
    await network.checkConnectivity();
    isRefreshingData.value = false;
  }
}

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

async function validateSessionOnline() {
  if (!network.isOnline || !pos.session) return;
  try {
    const userCookie = document.cookie.match(/user_id=([^;]+)/);
    const user = userCookie ? decodeURIComponent(userCookie[1]) : '';
    if (!user) return;

    const entries = await checkOpeningEntry(user);
    const isValid = entries.some((e: any) => e.name === pos.session?.pos_opening);

    if (!isValid) {
      if (confirm('Your local POS session is not active or has been closed on the server. Click OK to clear the inactive session and start a new one.')) {
        pos.clearSession();
        localStorage.removeItem('pos_session');
        router.replace({ name: 'POSOpening' });
      }
    }
  } catch (err) {
    console.warn('[POSView] Failed to validate session online:', err);
  }
}

watch(() => network.isOnline, (isOnline) => {
  if (isOnline) {
    validateSessionOnline();
  }
});

onMounted(() => {
  if (!pos.session) {
    router.replace({ name: 'POSOpening' });
    return;
  }
  validateSessionOnline();
  updateClock();
  clockTimer = setInterval(updateClock, 1000);
  sync.refreshPendingCount();
  window.addEventListener('beforeunload', handleBeforeUnload);

  // If session is restored, trigger loading of items and customers from IndexedDB/Cache
  if (pos.items.length === 0) {
    pos.loadItems(true);
  }
  if (pos.customers.length === 0) {
    pos.loadCustomers('');
  }
  pos.loadHeldInvoices();

  if (pos.session.pos_profile) {
    getPOSProfileData(pos.session.pos_profile).then((profileData) => {
      if (profileData && pos.session) {
        pos.session.hide_images = profileData.hide_images ? 1 : 0;
        pos.session.apply_discount_on = profileData.apply_discount_on || 'Grand Total';
        pos.session.print_format = profileData.print_format || '';
        pos.session.custom_offline_print_format = profileData.custom_offline_print_format || '';
        pos.session.standard_print_format = profileData.standard_print_format || '';
        pos.session.print_mode = profileData.print_mode || 'POS';
        pos.session.print_receipt_on_order_complete = profileData.print_receipt_on_order_complete ? 1 : 0;
        pos.session.open_print_dialogue_on_invoice_creation = profileData.open_print_dialogue_on_invoice_creation ? 1 : 0;
        pos.session.allow_partial_payment = profileData.allow_partial_payment;
        pos.session.allow_rate_change = profileData.allow_rate_change;
        pos.session.allow_discount_change = profileData.allow_discount_change;
        pos.session.disable_rounded_total = profileData.disable_rounded_total;
      }
    }).catch((err) => {
      console.warn('[POSView] Failed to refresh POS Profile details:', err);
    });
  }
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

function printHtmlViaIframe(html: string) {
  const oldIframe = document.getElementById('pos-print-iframe');
  if (oldIframe) {
    oldIframe.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'pos-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = 'none';
  iframe.style.bottom = '0px';
  iframe.style.right = '0px';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();

    const doPrint = () => {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }
    };

    iframe.contentWindow.addEventListener('afterprint', () => {
      iframe.remove();
    });

    setTimeout(doPrint, 500);
  }
}

function printUrlViaIframe(url: string) {
  const oldIframe = document.getElementById('pos-print-iframe');
  if (oldIframe) {
    oldIframe.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'pos-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = 'none';
  iframe.style.bottom = '0px';
  iframe.style.right = '0px';
  iframe.src = url;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    const doPrint = () => {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }
    };
    
    iframe.contentWindow?.addEventListener('afterprint', () => {
      iframe.remove();
    });

    setTimeout(doPrint, 500);
  };
}

async function onPaymentSuccess(invoiceName: string, offline: boolean, doc?: any, preOpenedWindow?: Window | null) {
  successToast.value = { name: invoiceName, offline };
  setTimeout(() => { successToast.value = null; }, 5000);

  const printMode = pos.session?.print_mode || 'POS';

  if (printMode === 'POS and Standard') {
    printChoiceDoc.value = doc;
    printChoiceInvoiceName.value = invoiceName;
    printChoiceOffline.value = offline;
    printChoicePreOpenedWindow.value = preOpenedWindow;
    showPrintChoiceModal.value = true;
  } else if (printMode === 'Standard') {
    await executePrint('Standard', invoiceName, offline, doc, preOpenedWindow);
  } else {
    await executePrint('POS', invoiceName, offline, doc, preOpenedWindow);
  }
}

function cancelPrintChoice() {
  showPrintChoiceModal.value = false;
  if (printChoicePreOpenedWindow.value) {
    printChoicePreOpenedWindow.value.close();
  }
}

async function handlePrintChoice(formatType: 'POS' | 'Standard') {
  showPrintChoiceModal.value = false;
  await executePrint(
    formatType,
    printChoiceInvoiceName.value,
    printChoiceOffline.value,
    printChoiceDoc.value,
    printChoicePreOpenedWindow.value
  );
}

async function executePrint(formatType: 'POS' | 'Standard', invoiceName: string, offline: boolean, doc?: any, preOpenedWindow?: Window | null) {
  const printFormat = formatType === 'Standard'
    ? (pos.session?.standard_print_format || 'Standard')
    : (pos.session?.print_format || '');
  const offlinePrintFormat = formatType === 'Standard'
    ? (pos.session?.standard_print_format || 'Standard')
    : (pos.session?.custom_offline_print_format || printFormat);

  const autoPrint = pos.session?.print_receipt_on_order_complete === 1;
  const openDialogue = pos.session?.open_print_dialogue_on_invoice_creation === 1;

  const forceOfflinePrint = offline || formatType === 'Standard';

  if (autoPrint) {
    if (!forceOfflinePrint) {
      try {
        const doctype = pos.session?.invoice_type || 'POS Invoice';
        const printUrl = `/printview?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(invoiceName)}&format=${encodeURIComponent(printFormat)}`;
        const resp = await fetch(printUrl, {
          headers: {
            'X-Frappe-Site-Name': window.location.hostname,
          },
          credentials: 'include',
        });
        
        let success = false;
        if (resp.ok && !resp.redirected && !resp.url.includes('/login')) {
          let html = await resp.text();
          if (html.includes('print-format')) {
            success = true;
            const baseTag = `<base href="${window.location.origin}">`;
            if (html.includes('<head>')) {
              html = html.replace('<head>', '<head>' + baseTag);
            } else {
              html = baseTag + html;
            }
            printHtmlViaIframe(html);
          }
        }

        if (!success) {
          if (doc) {
            console.warn('Failed to fetch/inject printview template. Falling back to offline printing.');
            const cachedPF = localStorage.getItem(`print_format_${offlinePrintFormat}`);
            const pfData = cachedPF ? JSON.parse(cachedPF) : { name: offlinePrintFormat };
            printInvoiceOffline(doc, pfData, null, true);
          } else {
            const fallbackUrl = `/printview?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(invoiceName)}&format=${encodeURIComponent(printFormat)}&trigger_print=1`;
            printUrlViaIframe(fallbackUrl);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch and inject printview for iframe print, falling back to offline printing:', err);
        if (doc) {
          const cachedPF = localStorage.getItem(`print_format_${offlinePrintFormat}`);
          const pfData = cachedPF ? JSON.parse(cachedPF) : { name: offlinePrintFormat };
          printInvoiceOffline(doc, pfData, null, true);
        } else {
          const doctype = pos.session?.invoice_type || 'POS Invoice';
          const fallbackUrl = `/printview?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(invoiceName)}&format=${encodeURIComponent(printFormat)}&trigger_print=1`;
          printUrlViaIframe(fallbackUrl);
        }
      }
    } else if (doc) {
      const cachedPF = localStorage.getItem(`print_format_${offlinePrintFormat}`);
      const pfData = cachedPF ? JSON.parse(cachedPF) : { name: offlinePrintFormat };
      printInvoiceOffline(doc, pfData, null, true);
    }
  } else if (openDialogue) {
    if (!forceOfflinePrint) {
      try {
        const doctype = pos.session?.invoice_type || 'POS Invoice';
        const printUrl = `/printview?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(invoiceName)}&format=${encodeURIComponent(printFormat)}`;
        const resp = await fetch(printUrl, {
          headers: {
            'X-Frappe-Site-Name': window.location.hostname,
          },
          credentials: 'include',
        });
        
        let success = false;
        if (resp.ok && !resp.redirected && !resp.url.includes('/login')) {
          let html = await resp.text();
          if (html.includes('print-format')) {
            success = true;
            
            const baseTag = `<base href="${window.location.origin}">`;
            const closeScript = `
              \x3Cscript>
                function doPrint() {
                  window.focus();
                  window.print();
                }
                window.addEventListener('afterprint', function() {
                  window.close();
                });
                setTimeout(doPrint, 500);
              \x3C/script>
            `;
            
            if (html.includes('<head>')) {
              html = html.replace('<head>', '<head>' + baseTag);
            } else {
              html = baseTag + html;
            }

            if (html.includes('</body>')) {
              html = html.replace('</body>', closeScript + '</body>');
            } else {
              html += closeScript;
            }

            const targetWin = preOpenedWindow || window.open('', '_blank');
            if (targetWin) {
              targetWin.document.open();
              targetWin.document.write(html);
              targetWin.document.close();
            }
          }
        }

        if (!success) {
          if (doc) {
            console.warn('Failed to fetch/inject printview template. Falling back to offline printing.');
            const cachedPF = localStorage.getItem(`print_format_${offlinePrintFormat}`);
            const pfData = cachedPF ? JSON.parse(cachedPF) : { name: offlinePrintFormat };
            printInvoiceOffline(doc, pfData, preOpenedWindow, false);
          } else {
            const fallbackUrl = `/printview?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(invoiceName)}&format=${encodeURIComponent(printFormat)}&trigger_print=1`;
            if (preOpenedWindow) {
              preOpenedWindow.location.href = fallbackUrl;
            } else {
              window.open(fallbackUrl, '_blank');
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch and inject printview, falling back to offline printing:', err);
        if (doc) {
          const cachedPF = localStorage.getItem(`print_format_${offlinePrintFormat}`);
          const pfData = cachedPF ? JSON.parse(cachedPF) : { name: offlinePrintFormat };
          printInvoiceOffline(doc, pfData, preOpenedWindow, false);
        } else {
          const doctype = pos.session?.invoice_type || 'POS Invoice';
          const fallbackUrl = `/printview?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(invoiceName)}&format=${encodeURIComponent(printFormat)}&trigger_print=1`;
          if (preOpenedWindow) {
            preOpenedWindow.location.href = fallbackUrl;
          } else {
            window.open(fallbackUrl, '_blank');
          }
        }
      }
    } else if (doc) {
      const cachedPF = localStorage.getItem(`print_format_${offlinePrintFormat}`);
      const pfData = cachedPF ? JSON.parse(cachedPF) : { name: offlinePrintFormat };
      printInvoiceOffline(doc, pfData, preOpenedWindow, false);
    }
  } else if (preOpenedWindow) {
    preOpenedWindow.close();
  }
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
.pos-topbar__forced-offline {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--pos-text-muted);
  cursor: pointer;
  user-select: none;
  padding: 4px 10px;
  border: 1px solid var(--pos-border);
  border-radius: 20px;
  background: var(--pos-surface-dim, rgba(255, 255, 255, 0.02));
  transition: all 0.15s ease;
}
.pos-topbar__forced-offline:hover {
  border-color: var(--pos-text-muted);
  color: var(--pos-text);
  background: var(--pos-border);
}
.pos-topbar__forced-offline-switch {
  position: relative;
  display: inline-block;
  width: 28px;
  height: 16px;
  flex-shrink: 0;
}
.pos-topbar__forced-offline-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.pos-topbar__forced-offline-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: var(--pos-border);
  transition: .2s ease;
  border-radius: 16px;
}
.pos-topbar__forced-offline-slider:before {
  position: absolute;
  content: "";
  height: 12px;
  width: 12px;
  left: 2px;
  bottom: 2px;
  background-color: #fff;
  transition: .2s ease;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.pos-topbar__forced-offline-switch input:checked + .pos-topbar__forced-offline-slider {
  background-color: #ef4444;
}
.pos-topbar__forced-offline-switch input:checked + .pos-topbar__forced-offline-slider:before {
  transform: translateX(12px);
}
.pos-topbar__forced-offline-label {
  font-size: 12px;
  font-weight: 600;
}
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
.pos-topbar__refresh-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.04);
  color: #6366f1;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.pos-topbar__refresh-btn:hover:not(:disabled) {
  border-color: #6366f1;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.08);
}
.pos-topbar__refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.rotating {
  animation: spin 1s linear infinite;
}
@keyframes download-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(3px); }
}
.downloading {
  animation: download-bounce 0.8s infinite ease-in-out;
}
/* ─── Main Layout ────────────────────────────────────────── */
.pos-main {
  display: grid;
  grid-template-columns: 1fr 360px;
  flex: 1;
  overflow: hidden;
  transition: grid-template-columns 0.3s ease;
}
.pos-main--details-open {
  grid-template-columns: 1fr 450px 360px;
}
.pos-main__items {
  padding: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.pos-main__details {
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

.pos-topbar__held-btn {
  display: flex;
  align-items: center;
  gap: 6px;
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
.pos-topbar__held-btn:hover {
  border-color: #8b5cf6;
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.08);
}
.pos-topbar__held-count {
  background: #8b5cf6;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 99px;
  min-width: 18px;
  text-align: center;
}

.pos-print-choice-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.pos-print-choice-card {
  background: var(--pos-bg-card, #ffffff);
  border: 1px solid var(--pos-border, #e5e7eb);
  border-radius: 16px;
  width: 90%;
  max-width: 480px;
  padding: 24px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  color: var(--pos-text, #1f2937);
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.pos-print-choice-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.pos-print-choice-icon {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  padding: 12px;
  border-radius: 99px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.pos-print-choice-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
}
.pos-print-choice-header p {
  margin: 0;
  font-size: 14px;
  color: var(--pos-text-muted, #6b7280);
}
.pos-print-choice-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.pos-print-choice-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 20px 12px;
  border-radius: 12px;
  border: 2px solid var(--pos-border, #e5e7eb);
  background: var(--pos-bg-sub, #f9fafb);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}
.pos-print-choice-btn:hover {
  transform: translateY(-2px);
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.05);
}
.pos-print-choice-btn .btn-icon {
  font-size: 32px;
}
.pos-print-choice-btn .btn-title {
  font-weight: 750;
  font-size: 15px;
  color: var(--pos-text, #1f2937);
}
.pos-print-choice-btn .btn-subtitle {
  font-size: 11px;
  color: var(--pos-text-muted, #6b7280);
}
.pos-print-choice-footer {
  display: flex;
  justify-content: center;
}
.pos-print-choice-cancel-btn {
  background: transparent;
  border: none;
  color: var(--pos-text-muted, #6b7280);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px 16px;
  border-radius: 8px;
  transition: all 0.15s;
}
.pos-print-choice-cancel-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--pos-text, #1f2937);
}

/* Transitions */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>

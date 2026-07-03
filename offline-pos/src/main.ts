import './style.css';
import { createApp, reactive } from "vue";

import { createPinia } from "pinia";
import { watch } from 'vue';
import App from "./App.vue";

import router from './router';
import { auth } from './lib/auth';
import { initTheme } from './composables/useTheme';

import { useNetworkStore } from './stores/networkStore';
import { useSyncStore } from './stores/syncStore';
import { openPOSDB } from './db/posDB';

// Apply saved theme BEFORE anything renders (prevents flash)
initTheme();

// ─── Create App ────────────────────────────────────────────
const app = createApp(App);
const pinia = createPinia();

// Plugins
app.use(pinia);
app.use(router);

// Global Provides
app.provide("$auth", auth);

// ─── Boot Stores ───────────────────────────────────────────
const networkStore = useNetworkStore(pinia);
const syncStore = useSyncStore(pinia);

// Setup online/offline listener
networkStore.setupListeners();

// Auto-sync pending invoices when back online
// IMPORTANT: Only sync if user is authenticated to avoid 401 errors
watch(
  () => networkStore.isOnline,
  async (online) => {
    if (online) {
      // Wait for TCP stack to settle — the 'online' event fires before
      // the network is actually ready for HTTP requests
      await new Promise(r => setTimeout(r, 1500));

      // Verify online session is active
      const sessionActive = await auth.checkOnlineSessionActive();
      if (!sessionActive) {
        console.log('[App] Back online but server session is not active — redirecting to login.');
        auth.clearLocalCookies();
        router.push({
          name: 'Login',
          query: {
            route: router.currentRoute.value.path,
            message: 'Session expired. Please log in again to sync your offline data.'
          }
        });
        return;
      }

      // Re-read cookie to get fresh auth state
      auth.refresh();

      if (!auth.isLoggedIn) {
        console.log('[App] Back online but user is not logged in — skipping sync.');
        return;
      }

      console.log('[App] Back online — starting sync...');
      await syncStore.syncAll();
      // Re-refresh CSRF after sync so subsequent UI-triggered API calls
      // (e.g. fetchCustomers) also use a fresh token, not the pre-sync one.
      await syncStore.refreshCSRFToken();

      // Refresh local IndexedDB master data after syncing
      try {
        const { usePOSStore } = await import('./stores/posStore');
        const posStore = usePOSStore(pinia);
        if (posStore.session) {
          console.log('[App] Back online — reloading master data (Items & Customers)...');
          await Promise.all([
            posStore.loadItems(true),
            posStore.loadCustomers('')
          ]);
          console.log('[App] Master data reloaded. Triggering full catalog background pre-fetch...');
          posStore.prefetchAllItems();
          posStore.prefetchAllCustomers();
        }
      } catch (err) {
        console.error('[App] Failed to reload master data on reconnection:', err);
      }
    }
  }
);

// Pre-open IndexedDB so it's ready
openPOSDB().catch((err) => console.error('[App] IndexedDB open failed:', err));

// ─── Route Guards ──────────────────────────────────────────
router.beforeEach(async (to, _from, next) => {
  const isLoginPage = to.meta?.isLoginPage === true;
  const isOffline = !navigator.onLine;

  if (isOffline) {
    const hasSavedSession = !!localStorage.getItem('pos_session');
    const lastUser = localStorage.getItem('last_logged_in_user');
    if (hasSavedSession && lastUser) {
      // Mock logged in state for offline mode
      auth.isLoggedIn = true;
      auth.user = lastUser;
      
      if (to.name !== 'POS') {
        return next({ name: 'POS' });
      }
      return next();
    }
  }

  if (!isLoginPage) {
    // Protected route — must be logged in
    if (!auth.isLoggedIn) {
      next({ name: 'Login', query: { route: to.path } });
    } else {
      next();
    }
  } else {
    // Login page — if already logged in, go to POS opening
    if (auth.isLoggedIn) {
      next({ name: 'POSOpening' });
    } else {
      next();
    }
  }
});

app.mount("#app");

// ─── Service Worker Registration ───────────────────────────
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/offline-pos/sw.js', { scope: '/offline-pos/' })
      .then((reg) => {
        console.log('[PWA] Service Worker registered with scope:', reg.scope);

        // Check for updates on load
        if (reg.waiting) {
          window.dispatchEvent(new CustomEvent('sw-update-available', { detail: reg }));
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New service worker version available.');
                window.dispatchEvent(new CustomEvent('sw-update-available', { detail: reg }));
              }
            });
          }
        });
      })
      .catch((err) => {
        console.error('[PWA] Service Worker registration failed:', err);
      });
  });
}

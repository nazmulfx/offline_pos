import './style.css';
import { createApp, reactive } from "vue";

import { createPinia } from "pinia";
import { watch } from 'vue';
import App from "./App.vue";

import router from './router';
import Auth from './lib/auth';
import { initTheme } from './composables/useTheme';

import { useNetworkStore } from './stores/networkStore';
import { useSyncStore } from './stores/syncStore';
import { openPOSDB } from './db/posDB';

// Apply saved theme BEFORE anything renders (prevents flash)
initTheme();

// ─── Create App ────────────────────────────────────────────
const app = createApp(App);
const pinia = createPinia();
const auth = reactive(new Auth());

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

      // Re-read cookie to get fresh auth state
      auth.cookie = Object.fromEntries(
        document.cookie.split('; ').filter(Boolean).map((part) => {
          const [k, ...v] = part.split('=');
          return [k, decodeURIComponent(v.join('='))];
        })
      );
      auth.isLoggedIn = !!auth.cookie.user_id && auth.cookie.user_id !== 'Guest';

      if (!auth.isLoggedIn) {
        console.log('[App] Back online but user is not logged in — skipping sync.');
        return;
      }

      console.log('[App] Back online — starting sync...');
      await syncStore.syncAll();
    }
  }
);

// Pre-open IndexedDB so it's ready
openPOSDB().catch((err) => console.error('[App] IndexedDB open failed:', err));

// ─── Route Guards ──────────────────────────────────────────
router.beforeEach(async (to, _from, next) => {
  const isLoginPage = to.meta?.isLoginPage === true;

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

<!--
  POSOpeningView.vue — POS Opening Entry check + creation
-->
<template>
  <div class="pos-opening">
    <div class="pos-opening__bg"></div>
    <div class="pos-opening__card">
      <!-- Logo / Title -->
      <div class="pos-opening__logo">
        <div class="pos-opening__logo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="32" height="32">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
        </div>
        <h1 class="pos-opening__title">Offline POS</h1>
        <p class="pos-opening__subtitle">Point of Sale Terminal</p>
      </div>

      <!-- Loading state -->
      <div v-if="isLoading" class="pos-opening__loading">
        <span class="spinner-lg"></span>
        <p>Checking POS session...</p>
      </div>

      <!-- Existing opening entry -->
      <div v-else-if="existingEntry" class="pos-opening__existing">
        <div class="pos-opening__info-card">
          <div class="pos-opening__info-row">
            <span class="pos-opening__info-label">POS Profile</span>
            <span class="pos-opening__info-val">{{ existingEntry.pos_profile }}</span>
          </div>
          <div class="pos-opening__info-row">
            <span class="pos-opening__info-label">Company</span>
            <span class="pos-opening__info-val">{{ existingEntry.company }}</span>
          </div>
          <div class="pos-opening__info-row">
            <span class="pos-opening__info-label">Opened</span>
            <span class="pos-opening__info-val">{{ formatDate(existingEntry.period_start_date) }}</span>
          </div>
        </div>
        <button class="pos-opening__btn pos-opening__btn--primary" @click="continueWithEntry">
          Continue Session
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
        <button class="pos-opening__btn pos-opening__btn--ghost" @click="existingEntry = null">
          Open New Session
        </button>
      </div>

      <!-- Create opening form -->
      <div v-else class="pos-opening__form">
        <div class="pos-opening__form-group">
          <label class="pos-opening__label">Company *</label>
          <select v-model="company" class="pos-opening__select" @change="loadPOSProfiles">
            <option value="">Select Company...</option>
            <option v-for="c in companies" :key="c.name" :value="c.name">{{ c.name }}</option>
          </select>
        </div>

        <div class="pos-opening__form-group">
          <label class="pos-opening__label">POS Profile *</label>
          <select v-model="posProfile" class="pos-opening__select" @change="loadPaymentMethods">
            <option value="">Select POS Profile...</option>
            <option v-for="p in posProfiles" :key="p.name" :value="p.name">{{ p.name }}</option>
          </select>
        </div>

        <!-- Opening Balance table -->
        <div v-if="balanceDetails.length > 0" class="pos-opening__balance">
          <label class="pos-opening__label">Opening Balance</label>
          <div class="pos-opening__balance-table">
            <div
              v-for="(item, idx) in balanceDetails"
              :key="idx"
              class="pos-opening__balance-row"
            >
              <span class="pos-opening__balance-method">{{ item.mode_of_payment }}</span>
              <input
                v-model.number="item.opening_amount"
                type="number"
                min="0"
                step="0.01"
                class="pos-opening__balance-input"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <!-- Error notification -->
        <Transition name="err-fade">
          <div v-if="errorMsg" class="pos-opening__error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="flex-shrink:0">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{{ errorMsg }}</span>
            <button class="pos-opening__error-close" @click="errorMsg = ''" title="Dismiss">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </Transition>

        <!-- Continue existing session (shown when duplicate session error) -->
        <Transition name="err-fade">
          <button
            v-if="isSessionOpenError"
            class="pos-opening__btn pos-opening__btn--primary"
            :disabled="isResuming"
            @click="resumeOpenSession"
          >
            <span v-if="isResuming" class="spinner-sm"></span>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            {{ isResuming ? 'Loading...' : 'Continue Session' }}
          </button>
        </Transition>

        <button
          class="pos-opening__btn pos-opening__btn--primary"
          :disabled="!company || !posProfile || isSubmitting || isSessionOpenError"
          @click="createOpeningEntry"
        >
          <span v-if="isSubmitting" class="spinner-sm"></span>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          {{ isSubmitting ? 'Opening...' : 'Open POS' }}
        </button>
      </div>

      <!-- Network status indicator -->
      <div class="pos-opening__network" :class="{ offline: !network.isOnline }">
        <span class="pos-opening__network-dot"></span>
        {{ network.isOnline ? 'Connected' : 'Offline' }}
      </div>

      <!-- Logout — only shown when online to prevent auth issues during sync -->
      <button
        v-if="network.isOnline"
        class="pos-opening__logout-btn"
        @click="handleLogout"
        :disabled="isLoggingOut"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        {{ isLoggingOut ? 'Signing out...' : 'Sign Out' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue';
import { useRouter } from 'vue-router';
import { useNetworkStore } from '../stores/networkStore';
import { usePOSStore } from '../stores/posStore';
import { checkOpeningEntry, createOpeningVoucher, getPOSProfileData } from '../services/invoiceService';
import call from '../lib/call';

const router = useRouter();
const network = useNetworkStore();
const pos = usePOSStore();
const $auth = inject<any>('$auth');

const isLoading = ref(true);
const isSubmitting = ref(false);
const isLoggingOut = ref(false);
const isResuming = ref(false);
const existingEntry = ref<any>(null);
const errorMsg = ref('');

// True when error is specifically a duplicate-session validation
const isSessionOpenError = computed(() =>
  !!errorMsg.value && /is open/i.test(errorMsg.value)
);

// Form state
const company = ref('');
const posProfile = ref('');
const companies = ref<any[]>([]);
const posProfiles = ref<any[]>([]);
const balanceDetails = ref<Array<{ mode_of_payment: string; opening_amount: number }>>([]);

onMounted(async () => {
  await loadCompanies();
  await checkExistingSession();
});

async function loadCompanies() {
  try {
    const result = await call('frappe.client.get_list', {
      doctype: 'Company',
      fields: ['name'],
      limit_page_length: 50,
    });
    companies.value = result || [];
    if (companies.value.length === 1) {
      company.value = companies.value[0].name;
      await loadPOSProfiles();
    }
  } catch (err) {
    console.error('[POSOpening] loadCompanies error:', err);
  }
}

async function loadPOSProfiles() {
  if (!company.value) return;
  try {
    const result = await call('frappe.client.get_list', {
      doctype: 'POS Profile',
      filters: { company: company.value, disabled: 0 },
      fields: ['name'],
      limit_page_length: 50,
    });
    posProfiles.value = result || [];
    if (posProfiles.value.length === 1) {
      posProfile.value = posProfiles.value[0].name;
      await loadPaymentMethods();
    }
  } catch (err) {
    console.error('[POSOpening] loadPOSProfiles error:', err);
  }
}

async function loadPaymentMethods() {
  if (!posProfile.value) return;
  try {
    const profile = await getPOSProfileData(posProfile.value);
    balanceDetails.value = (profile.payments || []).map((p: any) => ({
      mode_of_payment: p.mode_of_payment,
      opening_amount: 0,
    }));
  } catch (err) {
    console.error('[POSOpening] loadPaymentMethods error:', err);
  }
}

async function checkExistingSession() {
  isLoading.value = true;
  try {
    // Get current user from cookie
    const userCookie = document.cookie.match(/user_id=([^;]+)/);
    const user = userCookie ? decodeURIComponent(userCookie[1]) : '';
    const entries = await checkOpeningEntry(user);
    if (entries.length > 0) {
      existingEntry.value = entries[0];
    }
  } catch (err) {
    console.error('[POSOpening] checkExistingSession error:', err);
  } finally {
    isLoading.value = false;
  }
}

async function continueWithEntry() {
  if (!existingEntry.value) return;
  isLoading.value = true;
  try {
    const profileData = await getPOSProfileData(existingEntry.value.pos_profile);
    await pos.initSession(existingEntry.value, profileData);
    router.push({ name: 'POS' });
  } catch (err) {
    console.error('[POSOpening] continueWithEntry error:', err);
    alert('Failed to load POS session. Please try again.');
  } finally {
    isLoading.value = false;
  }
}

async function createOpeningEntry() {
  if (!company.value || !posProfile.value) return;
  errorMsg.value = '';
  isSubmitting.value = true;
  try {
    const opening = await createOpeningVoucher(
      posProfile.value,
      company.value,
      balanceDetails.value
    );
    const profileData = await getPOSProfileData(posProfile.value);
    await pos.initSession(opening, profileData);
    router.push({ name: 'POS' });
  } catch (err: any) {
    console.error('[POSOpening] createOpeningEntry error:', err);
    errorMsg.value = parseERPNextError(err);
  } finally {
    isSubmitting.value = false;
  }
}
async function resumeOpenSession() {
  isResuming.value = true;
  try {
    // Re-fetch the open entry for this user
    const userCookie = document.cookie.match(/user_id=([^;]+)/);
    const user = userCookie ? decodeURIComponent(userCookie[1]) : '';
    const entries = await checkOpeningEntry(user);
    if (entries.length === 0) {
      errorMsg.value = 'No open session found. Please refresh and try again.';
      return;
    }
    const entry = entries[0];
    const profileData = await getPOSProfileData(entry.pos_profile);
    await pos.initSession(entry, profileData);
    router.push({ name: 'POS' });
  } catch (err: any) {
    console.error('[POSOpening] resumeOpenSession error:', err);
    errorMsg.value = 'Failed to resume session. Please try again.';
  } finally {
    isResuming.value = false;
  }
}

function parseERPNextError(err: any): string {

  // Try to get the raw message string
  const raw: string = err?.exc || err?.message || err?.toString() || '';

  // ERPNext ValidationError: extract the message after the last colon in the traceback
  // e.g. "frappe.exceptions.ValidationError: sks is open. Close the POS..."
  const validationMatch = raw.match(/ValidationError:\s*(.+?)(?:\n|$)/);
  if (validationMatch) return validationMatch[1].trim();

  // Frappe _server_messages — JSON array of message objects
  try {
    const msgs = JSON.parse(err?._server_messages || '[]');
    if (Array.isArray(msgs) && msgs.length > 0) {
      const parsed = JSON.parse(msgs[0]);
      return parsed?.message || raw;
    }
  } catch { /* ignore */ }

  // Generic fallback
  return raw || 'Failed to open POS. Please check your POS Profile settings.';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

async function handleLogout() {
  if (isLoggingOut.value) return;
  isLoggingOut.value = true;
  try {
    await $auth.logout();
    // $auth.logout() calls window.location.reload() internally
  } catch (err) {
    console.error('[POSOpening] Logout error:', err);
    window.location.href = '/login';
  } finally {
    isLoggingOut.value = false;
  }
}
</script>

<style scoped>
.pos-opening {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pos-bg);
  position: relative;
  overflow: hidden;
  padding: 20px;
}
.pos-opening__bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 20% 40%, rgba(99,102,241,0.12) 0%, transparent 70%),
    radial-gradient(ellipse 50% 60% at 80% 70%, rgba(139,92,246,0.08) 0%, transparent 70%);
  pointer-events: none;
}
.pos-opening__card {
  background: var(--pos-surface);
  border: 1px solid var(--pos-border);
  border-radius: 24px;
  padding: 40px;
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.4);
  position: relative;
  z-index: 1;
}
.pos-opening__logo {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.pos-opening__logo-icon {
  width: 64px; height: 64px;
  border-radius: 18px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 8px 24px rgba(99,102,241,0.4);
}
.pos-opening__title {
  font-size: 26px;
  font-weight: 800;
  color: var(--pos-text);
  margin: 0;
}
.pos-opening__subtitle {
  font-size: 13px;
  color: var(--pos-text-muted);
  margin: 0;
}
.pos-opening__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 20px 0;
  color: var(--pos-text-muted);
  font-size: 14px;
}
.pos-opening__info-card {
  background: var(--pos-bg);
  border: 1px solid var(--pos-border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pos-opening__info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}
.pos-opening__info-label { color: var(--pos-text-muted); }
.pos-opening__info-val { font-weight: 700; color: var(--pos-text); }
.pos-opening__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.pos-opening__form-group { display: flex; flex-direction: column; gap: 6px; }
.pos-opening__label {
  font-size: 12px;
  font-weight: 700;
  color: var(--pos-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.pos-opening__select {
  width: 100%;
  background: var(--pos-bg);
  border: 1px solid var(--pos-border);
  border-radius: 10px;
  padding: 11px 14px;
  color: var(--pos-text);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}
.pos-opening__select:focus { border-color: var(--pos-accent); }
.pos-opening__balance { display: flex; flex-direction: column; gap: 8px; }
.pos-opening__balance-table { display: flex; flex-direction: column; gap: 6px; }
.pos-opening__balance-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--pos-bg);
  border: 1px solid var(--pos-border);
  border-radius: 8px;
  padding: 8px 12px;
}
.pos-opening__balance-method {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--pos-text);
}
.pos-opening__balance-input {
  width: 100px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--pos-border);
  outline: none;
  color: var(--pos-text);
  font-size: 14px;
  font-weight: 700;
  text-align: right;
  padding: 4px 0;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
}
.pos-opening__btn {
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.18s;
}
.pos-opening__btn--primary {
  border: none;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  box-shadow: 0 4px 20px rgba(99,102,241,0.35);
}
.pos-opening__btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 28px rgba(99,102,241,0.45);
}
.pos-opening__btn--primary:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
.pos-opening__btn--ghost {
  border: 1px solid var(--pos-border);
  background: transparent;
  color: var(--pos-text-muted);
}
.pos-opening__btn--ghost:hover { border-color: var(--pos-text-muted); color: var(--pos-text); }
.pos-opening__network {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #34d399;
  justify-content: center;
}
.pos-opening__network.offline { color: #f87171; }
.pos-opening__network-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2s infinite;
}
.pos-opening__existing { display: flex; flex-direction: column; gap: 12px; }
.spinner-lg {
  width: 36px; height: 36px;
  border: 3px solid var(--pos-border);
  border-top-color: var(--pos-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
.spinner-sm {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}
.pos-opening__logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px;
  background: none;
  border: 1px solid var(--pos-border);
  border-radius: 8px;
  color: var(--pos-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.pos-opening__logout-btn:hover:not(:disabled) {
  border-color: #f87171;
  color: #f87171;
  background: rgba(248,113,113,0.06);
}
.pos-opening__logout-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ─── Error notification ──────────────────────────────────── */
.pos-opening__error {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(220, 38, 38, 0.08);
  border: 1px solid rgba(220, 38, 38, 0.25);
  border-radius: 10px;
  color: #b91c1c;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
}
.pos-opening__error svg { margin-top: 1px; color: #dc2626; }
.pos-opening__error span { flex: 1; }
.pos-opening__error-close {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: #b91c1c;
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: background 0.1s;
  flex-shrink: 0;
}
.pos-opening__error-close:hover { background: rgba(220,38,38,0.1); }

/* Dark mode error */
:root[data-theme="dark"] .pos-opening__error,
html.dark .pos-opening__error {
  background: rgba(239,68,68,0.1);
  border-color: rgba(239,68,68,0.25);
  color: #fca5a5;
}
:root[data-theme="dark"] .pos-opening__error svg,
html.dark .pos-opening__error svg { color: #f87171; }
:root[data-theme="dark"] .pos-opening__error-close,
html.dark .pos-opening__error-close { color: #fca5a5; }

.err-fade-enter-active, .err-fade-leave-active { transition: all 0.2s ease; }
.err-fade-enter-from, .err-fade-leave-to { opacity: 0; transform: translateY(-6px); }
</style>

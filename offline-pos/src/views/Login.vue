<!--
  Login.vue — POS Login Page (doppio-free)
-->
<template>
  <div class="login-page">
    <div class="login-bg"></div>
    <div class="login-card">
      <!-- Logo -->
      <div class="login-logo">
        <div class="login-logo__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="32" height="32">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
        </div>
        <h1 class="login-logo__title">Offline POS</h1>
        <p class="login-logo__sub">Sign in to continue</p>
      </div>

      <!-- Form -->
      <form @submit.prevent="login" class="login-form">
        <div class="login-form__group">
          <label class="login-form__label">Username / Email</label>
          <input
            v-model="email"
            type="text"
            autocomplete="username"
            placeholder="admin or user@example.com"
            class="login-form__input"
            :disabled="isLoading"
            required
          />
        </div>

        <div class="login-form__group">
          <label class="login-form__label">Password</label>
          <div class="login-form__pw-wrap">
            <input
              v-model="password"
              :type="showPw ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="••••••••"
              class="login-form__input"
              :disabled="isLoading"
              required
            />
            <button type="button" class="login-form__pw-toggle" @click="showPw = !showPw">
              <svg v-if="!showPw" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Error -->
        <p v-if="errorMsg" class="login-form__error">{{ errorMsg }}</p>

        <button type="submit" class="login-form__btn" :disabled="isLoading || !email || !password">
          <span v-if="isLoading" class="spinner-sm"></span>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          {{ isLoading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>

      <!-- Network status -->
      <div class="login-network" :class="{ offline: !isOnline }">
        <span class="login-network__dot"></span>
        {{ isOnline ? 'Connected to server' : 'No connection — login requires internet' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useSyncStore } from '../stores/syncStore';

const router = useRouter();
const route = useRoute();
const $auth = inject<any>('$auth');
const syncStore = useSyncStore();

const email = ref('');
const password = ref('');
const isLoading = ref(false);
const errorMsg = ref('');
const showPw = ref(false);

const isOnline = computed(() => navigator.onLine);

async function login() {
  if (!email.value || !password.value) return;
  isLoading.value = true;
  errorMsg.value = '';
  try {
    const res = await $auth.login(email.value, password.value);
    if (res) {
      // Trigger sync of any pending offline invoices after login
      if (navigator.onLine) {
        syncStore.syncAll().catch((e) =>
          console.warn('[Login] Post-login sync error:', e)
        );
      }
      const redirect = route.query.route as string || '/pos-opening';
      router.push(redirect);
    } else {
      errorMsg.value = 'Invalid credentials. Please try again.';
    }
  } catch (err: any) {
    errorMsg.value = err?.messages?.[0] || err?.message || 'Login failed. Please check your credentials.';
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pos-bg);
  position: relative;
  padding: 20px;
}
.login-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 30% 30%, rgba(99,102,241,0.10) 0%, transparent 70%),
    radial-gradient(ellipse 50% 60% at 70% 80%, rgba(139,92,246,0.07) 0%, transparent 70%);
  pointer-events: none;
}
.login-card {
  background: var(--pos-surface);
  border: 1px solid var(--pos-border);
  border-radius: 24px;
  padding: 44px 40px;
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.4);
  position: relative;
  z-index: 1;
}
.login-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}
.login-logo__icon {
  width: 64px; height: 64px;
  border-radius: 18px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 8px 24px rgba(99,102,241,0.4);
}
.login-logo__title {
  font-size: 24px;
  font-weight: 800;
  color: var(--pos-text);
  margin: 0;
}
.login-logo__sub { font-size: 13px; color: var(--pos-text-muted); margin: 0; }
.login-form { display: flex; flex-direction: column; gap: 16px; }
.login-form__group { display: flex; flex-direction: column; gap: 6px; }
.login-form__label {
  font-size: 12px;
  font-weight: 700;
  color: var(--pos-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.login-form__input {
  width: 100%;
  background: var(--pos-bg);
  border: 1px solid var(--pos-border);
  border-radius: 10px;
  padding: 12px 14px;
  color: var(--pos-text);
  font-size: 14px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.login-form__input:focus { border-color: var(--pos-accent); box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
.login-form__input:disabled { opacity: 0.5; }
.login-form__pw-wrap { position: relative; }
.login-form__pw-wrap .login-form__input { padding-right: 44px; }
.login-form__pw-toggle {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--pos-text-muted);
  cursor: pointer;
  display: flex;
  padding: 4px;
}
.login-form__pw-toggle:hover { color: var(--pos-text); }
.login-form__error {
  background: rgba(248,113,113,0.1);
  border: 1px solid rgba(248,113,113,0.3);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  color: #f87171;
  margin: 0;
}
.login-form__btn {
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.18s;
  box-shadow: 0 4px 20px rgba(99,102,241,0.35);
  margin-top: 4px;
}
.login-form__btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(99,102,241,0.45); }
.login-form__btn:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
.login-network {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: #34d399;
  font-weight: 500;
}
.login-network.offline { color: #fbbf24; }
.login-network__dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2s infinite;
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
</style>

<!--
  OfflineBanner.vue — Shows offline status + pending sync count
-->
<template>
  <Transition name="slide-down">
    <div v-if="!network.isOnline" class="offline-banner">
      <div class="offline-banner__inner">
        <span class="offline-banner__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
        </span>
        <span class="offline-banner__text">
          Offline Mode
          <span v-if="sync.pendingCount > 0" class="offline-banner__pending">
            — {{ sync.pendingCount }} invoice{{ sync.pendingCount > 1 ? 's' : '' }} pending sync
          </span>
        </span>
        <span class="offline-banner__dot"></span>
      </div>
    </div>
  </Transition>

  <!-- Sync success banner -->
  <Transition name="slide-down">
    <div v-if="showSyncSuccess" class="sync-success-banner">
      <span>✓ {{ lastSyncCount }} invoice{{ lastSyncCount > 1 ? 's' : '' }} synced successfully</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useNetworkStore } from '../../stores/networkStore';
import { useSyncStore } from '../../stores/syncStore';

const network = useNetworkStore();
const sync = useSyncStore();

const showSyncSuccess = ref(false);
const lastSyncCount = ref(0);

// Watch for sync completing
watch(
  () => sync.isSyncing,
  (syncing, wasSyncing) => {
    if (wasSyncing && !syncing && network.isOnline && sync.pendingCount === 0) {
      lastSyncCount.value = 1;
      showSyncSuccess.value = true;
      setTimeout(() => { showSyncSuccess.value = false; }, 4000);
    }
  }
);
</script>

<style scoped>
.offline-banner {
  background: linear-gradient(90deg, #b91c1c, #dc2626);
  color: #fff;
  padding: 8px 20px;
  width: 100%;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.offline-banner__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.offline-banner__icon {
  display: flex;
  align-items: center;
}
.offline-banner__icon svg {
  width: 16px;
  height: 16px;
  stroke: #fff;
}
.offline-banner__pending {
  font-weight: 400;
  opacity: 0.9;
}
.offline-banner__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fca5a5;
  animation: pulse 1.5s infinite;
  margin-left: auto;
}
.sync-success-banner {
  background: linear-gradient(90deg, #065f46, #059669);
  color: #fff;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}
</style>

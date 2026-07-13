/**
 * networkStore.ts — Online/Offline detection store (Pinia)
 */
import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';

export const useNetworkStore = defineStore('network', () => {
  const isForcedOffline = ref<boolean>(localStorage.getItem('pos_forced_offline') === 'true');
  const isOnline = ref<boolean>(navigator.onLine && !isForcedOffline.value);
  const lastOnlineAt = ref<Date | null>(navigator.onLine && !isForcedOffline.value ? new Date() : null);
  const reconnectedAt = ref<Date | null>(null);
  let heartbeatInterval: any = null;

  watch(isForcedOffline, (newVal) => {
    localStorage.setItem('pos_forced_offline', String(newVal));
    if (newVal) {
      isOnline.value = false;
    } else {
      checkConnectivity();
    }
  });

  async function checkConnectivity(): Promise<boolean> {
    if (isForcedOffline.value) {
      isOnline.value = false;
      return false;
    }
    if (!navigator.onLine) {
      isOnline.value = false;
      return false;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('/api/method/frappe.ping', {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        if (!isOnline.value) {
          reconnectedAt.value = new Date();
        }
        isOnline.value = true;
        lastOnlineAt.value = new Date();
        return true;
      } else {
        isOnline.value = false;
        return false;
      }
    } catch (err) {
      isOnline.value = false;
      return false;
    }
  }

  async function testPhysicalConnection(): Promise<boolean> {
    if (!navigator.onLine) return false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch('/api/method/frappe.ping', {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  function setupListeners() {
    window.addEventListener('online', () => {
      if (!isForcedOffline.value) {
        checkConnectivity();
      }
    });
    window.addEventListener('offline', () => {
      isOnline.value = false;
      reconnectedAt.value = null;
    });

    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      if (!isForcedOffline.value && navigator.onLine) {
        checkConnectivity();
      }
    }, 15000);
  }

  const statusLabel = computed(() => {
    if (isForcedOffline.value) return 'Offline Mode';
    return isOnline.value ? 'Online' : 'Offline';
  });

  return {
    isOnline,
    isForcedOffline,
    lastOnlineAt,
    reconnectedAt,
    statusLabel,
    setupListeners,
    checkConnectivity,
    testPhysicalConnection
  };
});

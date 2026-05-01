/**
 * networkStore.ts — Online/Offline detection store (Pinia)
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useNetworkStore = defineStore('network', () => {
  const isOnline = ref<boolean>(navigator.onLine);
  const lastOnlineAt = ref<Date | null>(navigator.onLine ? new Date() : null);
  const reconnectedAt = ref<Date | null>(null);

  function setupListeners() {
    window.addEventListener('online', () => {
      isOnline.value = true;
      lastOnlineAt.value = new Date();
      reconnectedAt.value = new Date();
    });
    window.addEventListener('offline', () => {
      isOnline.value = false;
      reconnectedAt.value = null;
    });
  }

  const statusLabel = computed(() =>
    isOnline.value ? 'Online' : 'Offline'
  );

  return { isOnline, lastOnlineAt, reconnectedAt, statusLabel, setupListeners };
});

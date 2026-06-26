<template>
	<div class="pos-app">
		<router-view />
    <POSAlertModal />
	</div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useNetworkStore } from './stores/networkStore';
import { useSyncStore } from './stores/syncStore';
import { usePOSStore } from './stores/posStore';
import POSAlertModal from './components/pos/POSAlertModal.vue';

const network = useNetworkStore();
const sync = useSyncStore();
const pos = usePOSStore();

function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (!network.isOnline && pos.session) {
    e.preventDefault();
    e.returnValue = 'You are currently offline. Reloading the page will require an internet connection to resume your POS session. Are you sure you want to reload?';
    return e.returnValue;
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
});
</script>

<style>
.pos-app {
	font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	height: 100%;
}
</style>

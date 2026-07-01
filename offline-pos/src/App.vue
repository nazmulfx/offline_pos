<template>
	<div class="pos-app">
		<router-view />
    <POSAlertModal />

		<!-- PWA Update Notification Banner -->
		<transition name="fade-slide">
			<div v-if="showUpdateBanner" class="pwa-update-banner">
				<div class="pwa-update-content">
					<div class="pwa-icon-container">
						<svg class="update-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 4.79M9 11l3 3L22 4" />
						</svg>
					</div>
					<div class="pwa-text-container">
						<h4>Update Available!</h4>
						<p>A new version of the POS application is ready. Click update to apply.</p>
					</div>
				</div>
				<div class="pwa-action-buttons">
					<button class="btn-update" @click="updateApp">Update & Reload</button>
					<button class="btn-dismiss" @click="showUpdateBanner = false">Dismiss</button>
				</div>
			</div>
		</transition>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useNetworkStore } from './stores/networkStore';
import { useSyncStore } from './stores/syncStore';
import { usePOSStore } from './stores/posStore';
import POSAlertModal from './components/pos/POSAlertModal.vue';

const network = useNetworkStore();
const sync = useSyncStore();
const pos = usePOSStore();

const showUpdateBanner = ref(false);
let swRegistration: ServiceWorkerRegistration | null = null;

function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (!network.isOnline && pos.session) {
    e.preventDefault();
    e.returnValue = 'You are currently offline. Reloading the page will require an internet connection to resume your POS session. Are you sure you want to reload?';
    return e.returnValue;
  }
}

function handleSWUpdate(event: Event) {
  const customEvent = event as CustomEvent<ServiceWorkerRegistration>;
  swRegistration = customEvent.detail;
  showUpdateBanner.value = true;
}

function updateApp() {
  if (swRegistration && swRegistration.waiting) {
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
  showUpdateBanner.value = false;
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('sw-update-available', handleSWUpdate);
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }
});

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  window.removeEventListener('sw-update-available', handleSWUpdate);
});
</script>

<style>
.pos-app {
	font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	height: 100%;
}

/* Style for PWA update banner */
.pwa-update-banner {
	position: fixed;
	bottom: 24px;
	right: 24px;
	z-index: 99999;
	background: rgba(30, 41, 59, 0.85); /* Slate 800 with glassmorphism */
	backdrop-filter: blur(12px);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	padding: 16px 20px;
	box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
	display: flex;
	align-items: center;
	gap: 24px;
	max-width: 450px;
	color: #f8fafc;
	animation: slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.pwa-update-content {
	display: flex;
	align-items: center;
	gap: 16px;
}

.pwa-icon-container {
	background: rgba(99, 102, 241, 0.2); /* Indigo with transparency */
	border-radius: 50%;
	padding: 8px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: #818cf8;
}

.update-icon {
	width: 24px;
	height: 24px;
}

.pwa-text-container h4 {
	margin: 0 0 4px 0;
	font-size: 15px;
	font-weight: 600;
	letter-spacing: 0.3px;
}

.pwa-text-container p {
	margin: 0;
	font-size: 13px;
	color: #94a3b8; /* Slate 400 */
	line-height: 1.4;
}

.pwa-action-buttons {
	display: flex;
	gap: 8px;
	flex-shrink: 0;
}

.btn-update {
	background: #6366f1; /* Indigo 500 */
	color: white;
	border: none;
	border-radius: 8px;
	padding: 8px 14px;
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.2s ease;
	box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.4);
}

.btn-update:hover {
	background: #4f46e5;
	transform: translateY(-1px);
}

.btn-dismiss {
	background: transparent;
	color: #94a3b8;
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 8px;
	padding: 8px 12px;
	font-size: 13px;
	cursor: pointer;
	transition: all 0.2s ease;
}

.btn-dismiss:hover {
	background: rgba(255, 255, 255, 0.05);
	color: #cbd5e1;
}

/* Animations */
@keyframes slide-in {
	from {
		transform: translateY(20px) scale(0.95);
		opacity: 0;
	}
	to {
		transform: translateY(0) scale(1);
		opacity: 1;
	}
}

.fade-slide-enter-active,
.fade-slide-leave-active {
	transition: all 0.3s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
	transform: translateY(20px);
	opacity: 0;
}
</style>

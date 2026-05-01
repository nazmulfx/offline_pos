<template>
	<div class="pos-app">
		<router-view />
	</div>
</template>

<script setup lang="ts">
import { useNetworkStore } from './stores/networkStore';
import { useSyncStore } from './stores/syncStore';

// Stores are already initialized in main.ts
// Just reference here so Vue Devtools shows them
const network = useNetworkStore();
const sync = useSyncStore();
</script>

<style>
.pos-app {
	font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	height: 100%;
}
</style>

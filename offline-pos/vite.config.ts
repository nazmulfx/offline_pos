import path from 'path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import proxyOptions from './proxyOptions';

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		vue(),
		VitePWA({
			registerType: 'prompt',
			injectRegister: null, // manual registration in main.ts
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}'],
				navigateFallback: 'index.html',
				navigateFallbackDenylist: [/^\/api\//, /^\/assets\//, /^\/files\//],
			},
			manifest: {
				name: 'Offline Sync POS',
				short_name: 'OfflinePOS',
				description: 'Offline-first Point of Sale terminal with automated synchronization',
				theme_color: '#6366f1',
				background_color: '#0f172a',
				display: 'standalone',
				orientation: 'portrait',
				start_url: '/offline-pos/',
				scope: '/offline-pos/',
				icons: [
					{
						src: 'pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png',
					},
					{
						src: 'pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
					},
					{
						src: 'pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any maskable',
					},
				],
			},
		}),
	],
	server: {
		port: 8080,
		host: '0.0.0.0',
		proxy: proxyOptions
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src')
		}
	},
	build: {
		outDir: '../offline_pos/public/offline-pos',
		emptyOutDir: true,
		target: 'es2015',
	},
});

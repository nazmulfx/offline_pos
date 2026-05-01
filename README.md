<div align="center">

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.8" width="80" height="80">
  <circle cx="9" cy="21" r="1"/>
  <circle cx="20" cy="21" r="1"/>
  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
</svg>

# Offline POS

**A production-grade, offline-capable Point of Sale terminal built on ERPNext.**  
Works seamlessly online and offline — never lose a sale due to connectivity issues.

[![ERPNext](https://img.shields.io/badge/ERPNext-v15%2B-blue?style=flat-square)](https://erpnext.com)
[![Vue 3](https://img.shields.io/badge/Vue-3.x-42b883?style=flat-square&logo=vue.js)](https://vuejs.org)
[![Vite](https://img.shields.io/badge/Vite-5.x-646cff?style=flat-square&logo=vite)](https://vitejs.dev)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

</div>

---

## Overview

**Offline POS** is a Frappe/ERPNext app that embeds a fully offline-capable POS terminal directly into your ERPNext instance. Invoices created while offline are queued in the browser's IndexedDB and automatically synced to ERPNext the moment connectivity is restored — with zero manual intervention.

The frontend is a standalone **Vue 3 + Vite** SPA served from the Frappe web layer. It talks exclusively to ERPNext's REST API and requires no additional backend dependencies.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🛒 **Offline-first cart** | Add items, select customers, and submit invoices with no internet |
| 🔄 **Auto-sync queue** | Pending invoices stored in IndexedDB, synced on reconnect |
| 🌐 **Network awareness** | Live Online / Offline status badge in the topbar |
| 📋 **POS Session management** | Open / close POS sessions with balance reconciliation |
| 🧾 **Sales Invoice & POS Invoice** | Respects the POS Profile's `Invoice type` setting |
| 👤 **Customer management** | Search existing customers or create new ones inline |
| 🌙 **Dark / Light theme** | Persistent theme toggle with system preference detection |
| 🔐 **Secure auth flow** | Logout blocked in offline mode to prevent sync auth errors |
| 📦 **Opening balance** | Configurable per-payment-method opening amounts |
| 💳 **Multiple payment methods** | Supports all payment modes configured in the POS Profile |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ERPNext (Frappe)                        │
│  REST API  ──►  POS Profile, Items, Customers, Invoices     │
└──────────────────────┬──────────────────────────────────────┘
                       │  HTTP (online) / queued (offline)
┌──────────────────────▼──────────────────────────────────────┐
│                  Vue 3 SPA  (offline-pos/)                   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  POSOpening  │  │   POSView    │  │   Login / Auth   │  │
│  │  (session)   │  │  (terminal)  │  │                  │  │
│  └──────────────┘  └──────┬───────┘  └──────────────────┘  │
│                            │                                  │
│              ┌─────────────┼─────────────┐                   │
│              │             │             │                    │
│        ItemSelector     Cart        PaymentModal             │
│        CustomerSelector NumberPad   POSClosingModal          │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Pinia Stores: posStore · syncStore · networkStore    │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  IndexedDB (posDB) — offline invoice queue            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
offline_pos/                        ← Frappe app root
├── offline_pos/
│   ├── hooks.py                    ← App hooks, route rules
│   └── www/
│       └── offline-pos.py          ← Serves the SPA page
└── offline-pos/                    ← Vue 3 frontend
    ├── src/
    │   ├── main.ts                 ← App entry, theme init
    │   ├── style.css               ← Global design system (CSS vars)
    │   ├── App.vue
    │   ├── views/
    │   │   ├── Login.vue           ← Auth page
    │   │   ├── POSOpeningView.vue  ← Session open/resume
    │   │   └── POSView.vue         ← Main POS terminal
    │   ├── components/
    │   │   └── pos/
    │   │       ├── Cart.vue        ← Cart panel
    │   │       ├── CartItem.vue    ← Individual cart row
    │   │       ├── CustomerSelector.vue
    │   │       ├── ItemCard.vue
    │   │       ├── ItemSelector.vue
    │   │       ├── NumberPad.vue
    │   │       ├── OfflineBanner.vue
    │   │       ├── PaymentModal.vue
    │   │       └── POSClosingModal.vue
    │   ├── stores/
    │   │   ├── posStore.ts         ← Session & cart state
    │   │   ├── syncStore.ts        ← Offline queue & sync
    │   │   └── networkStore.ts     ← Online/offline detection
    │   ├── services/
    │   │   ├── invoiceService.ts   ← Invoice submission
    │   │   ├── itemService.ts      ← Item fetch & search
    │   │   └── customerService.ts  ← Customer CRUD
    │   ├── composables/
    │   │   └── useTheme.ts         ← Dark/light theme toggle
    │   ├── db/
    │   │   └── posDB.ts            ← IndexedDB wrapper
    │   └── lib/
    │       ├── auth.ts             ← Auth state
    │       └── call.ts             ← Frappe API wrapper
    ├── vite.config.ts
    └── package.json
```

---

## 🚀 Installation

### Prerequisites
- ERPNext v15 or v16
- Frappe Bench

### Steps

```bash
# 1. Get the app
cd /path/to/your/bench
bench get-app https://github.com/nazmul/offline_pos --branch version-16

# 2. Install on your site
bench --site your-site.local install-app offline_pos

# 3. Build the Vue frontend
cd apps/offline_pos/offline-pos
yarn install
yarn build

# 4. Clear Frappe cache
bench --site your-site.local clear-cache
```

### Access the POS

```
https://your-site.local/offline-pos
```

---

## ⚙️ Configuration

### POS Profile Setup

1. Go to **ERPNext → Point of Sale → POS Profile**
2. Create or open a POS Profile
3. Set:
   - **Company** — your company
   - **Write Off Account** — required for closing
   - **Payment Methods** — add Cash, Card, etc.
   - **Invoice Type** — `Sales Invoice` or `POS Invoice`

### User Permissions

Ensure the POS user has permission for:
- `POS Profile`
- `POS Opening Entry`
- `Sales Invoice` / `POS Invoice`
- `Customer`
- `Item`

---

## 🔄 Offline Workflow

```
User adds items & submits invoice
          │
          ▼
    Online?  ──Yes──► Submit to ERPNext immediately
          │
         No
          │
          ▼
  Save to IndexedDB queue
  (invoice stored locally)
          │
          ▼
   Connection restored
          │
          ▼
  syncStore.syncAll() triggers
          │
          ▼
  Each queued invoice submitted to ERPNext
  (auth check → skip if not logged in)
```

> **Note:** The Logout button is hidden in offline mode to prevent authentication errors during the sync process. Log out only when online.

---

## 🎨 Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | Vue 3 (Composition API + `<script setup>`) |
| State management | Pinia |
| Build tool | Vite 5 |
| Offline storage | IndexedDB (custom wrapper) |
| Styling | Vanilla CSS with CSS Custom Properties |
| Backend | Frappe / ERPNext REST API |
| Auth | Cookie-based (Frappe session) |

---

## 🧩 Theme System

The app ships with a **dual-theme design system** powered by CSS custom properties:

```css
/* Light (default) */
:root { --bg: #f0f2f8; --surface: #ffffff; --accent: #6366f1; ... }

/* Dark override */
html.dark { --bg: #0f1117; --surface: #1a1d27; --accent: #6366f1; ... }
```

Theme is toggled via the **☀️/🌙 button** in the POS topbar. Preference is saved to `localStorage` and system preference is detected automatically on first visit.

---

## 🛠 Development

```bash
cd apps/offline_pos/offline-pos

# Install dependencies
yarn install

# Start dev server (proxies to Frappe)
yarn dev

# Type check
yarn vue-tsc

# Production build
yarn build
```

> The `vite.config.ts` proxies API requests to `http://localhost:8000` during development.

---

## 📋 POS Session Lifecycle

```
Login
  └─► POSOpening ──► Check existing open session?
                          │
                    Yes ──┤── Continue Session ──► POSView
                          │
                    No ───┤── Select Company + Profile
                              Set opening balances
                              Open POS ──────────► POSView
                                                       │
                                               Add items to cart
                                               Select customer
                                               Process payment
                                                       │
                                               Close POS (reconcile)
                                                       │
                                               POS Closing Entry created
                                                       │
                                              Back to POSOpening
```

---

## 🤝 Contributing

```bash
cd apps/offline_pos

# Install pre-commit hooks
pip install pre-commit
pre-commit install
```

Pre-commit runs: `ruff` · `eslint` · `prettier` · `pyupgrade`

---

## 📄 License

MIT © [Nazmul Hossain](mailto:nazmul@invento.com.bd)

---

<div align="center">

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.8" width="28" height="28">
  <circle cx="9" cy="21" r="1"/>
  <circle cx="20" cy="21" r="1"/>
  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
</svg>

*Built with ❤️ for ERPNext — sell anywhere, sync everywhere.*

</div>

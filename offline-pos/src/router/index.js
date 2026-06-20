import { createRouter, createWebHistory } from "vue-router";
import authRoutes from './auth';

const routes = [
  {
    path: "/",
    name: "Home",
    redirect: "/pos-opening",
  },
  ...authRoutes,
  {
    path: "/pos-opening",
    name: "POSOpening",
    component: () => import("../views/POSOpeningView.vue"),
  },
  {
    path: "/pos",
    name: "POS",
    component: () => import("../views/POSView.vue"),
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/",
  },
];

const router = createRouter({
  history: createWebHistory("/offline-pos"),
  routes,
});

export default router;

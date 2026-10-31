import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './style.css';
const routes = [
  '/',
  '/products/:id',
  '/cart',
  '/checkout',
  '/login',
  '/register',
  '/orders',
  '/orders/:id',
  '/admin',
  '/admin/products',
  '/admin/categories',
  '/admin/orders',
  '/admin/payments',
  '/:pathMatch(.*)*',
].map((path) => ({ path, component: { template: '<span />' } }));
const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});
createApp(App).use(createPinia()).use(router).mount('#app');

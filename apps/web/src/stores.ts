import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
export type Product = {
  id: number;
  name: string;
  sku: string;
  description: string;
  price: number;
  stock: number;
  categoryId: number;
  category?: { name: string };
  isActive: boolean;
  imageUrl?: string;
};
let csrf = '';
export async function api(path: string, options: RequestInit = {}) {
  const method = options.method || 'GET';
  if (!['GET', 'HEAD'].includes(method) && !csrf) {
    const result = await fetch('/api/auth/csrf', { credentials: 'include' });
    csrf = (await result.json()).data.csrfToken;
  }
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...((options.headers as Record<string, string>) || {}),
  };
  if (!['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = csrf;
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'include' });
  if (response.status === 204) return { data: null };
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/me' && path !== '/auth/login') {
      window.dispatchEvent(new CustomEvent('sistabrew-auth-expired'));
    }
    if (result.error?.code === 'CSRF_INVALID') {
      csrf = '';
    }
    throw Object.assign(new Error(result.error?.message || 'Unable to complete request.'), {
      status: response.status,
      code: result.error?.code,
    });
  }
  if (result.data?.csrfToken) csrf = result.data.csrfToken;
  return result;
}
export const useAuth = defineStore('auth', () => {
  const user = ref<any>(null),
    ready = ref(false);
  async function load() {
    try {
      user.value = (await api('/auth/me')).data;
    } catch {
      user.value = null;
    } finally {
      ready.value = true;
    }
  }
  async function login(email: string, password: string) {
    user.value = (
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    ).data.user;
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    user.value = null;
    csrf = '';
  }
  return { user, ready, load, login, logout };
});
export const useCart = defineStore('cart', () => {
  let saved: any = [];
  try {
    saved = JSON.parse(localStorage.getItem('sistabrew-cart') || '[]');
  } catch {}
  const items = ref<{ productId: number; quantity: number }[]>(
    Array.isArray(saved)
      ? saved.filter(
          (i: any) =>
            Number.isInteger(i.productId) &&
            i.productId > 0 &&
            Number.isInteger(i.quantity) &&
            i.quantity > 0 &&
            i.quantity <= 99,
        )
      : [],
  );
  const products = ref<Product[]>([]);
  const count = computed(() => items.value.reduce((n, i) => n + i.quantity, 0));
  const lines = computed(() =>
    items.value.map((i) => ({ ...i, product: products.value.find((p) => p.id === i.productId) })),
  );
  const subtotal = computed(() =>
    lines.value.reduce((n, i) => n + (i.product?.price || 0) * i.quantity, 0),
  );
  function save() {
    localStorage.setItem('sistabrew-cart', JSON.stringify(items.value));
  }
  function add(p: Product, qty = 1) {
    const old = items.value.find((i) => i.productId === p.id);
    if ((old?.quantity || 0) + qty > Math.min(p.stock, 99))
      throw new Error('You’ve reached the available quantity.');
    if (old) old.quantity += qty;
    else items.value.push({ productId: p.id, quantity: qty });
    if (!products.value.find((i) => i.id === p.id)) products.value.push(p);
    save();
  }
  function set(id: number, qty: number) {
    if (qty <= 0) items.value = items.value.filter((i) => i.productId !== id);
    else {
      const line = items.value.find((i) => i.productId === id);
      if (line) line.quantity = Math.min(qty, 99);
    }
    save();
  }
  function clear() {
    items.value = [];
    save();
  }
  async function refresh() {
    products.value = (
      await Promise.all(
        items.value.map(async (i) => {
          try {
            return (await api(`/products/${i.productId}`)).data;
          } catch {
            return null;
          }
        }),
      )
    ).filter(Boolean);
  }
  return { items, products, count, lines, subtotal, add, set, clear, refresh };
});
export const money = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);
export const label = (s: string) =>
  s
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import {
  Search,
  ShoppingBag,
  ArrowRight,
  ArrowUpRight,
  Plus,
  Minus,
  X,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Leaf,
  Heart,
  Sparkles,
  Truck,
  Package,
  ShieldCheck,
  Menu,
  LogOut,
  LayoutDashboard,
  Boxes,
  Tags,
  Receipt,
  Wallet,
  Upload,
  Clock,
  MapPin,
  Mail,
  Instagram,
  SlidersHorizontal,
  CheckCircle,
  AlertCircle,
} from 'lucide-vue-next';
import ProductArt from './ProductArt.vue';
import { api, useAuth, useCart, money, label, type Product } from './stores';
const route = useRoute(),
  router = useRouter(),
  auth = useAuth(),
  cart = useCart();
const products = ref<Product[]>([]),
  categories = ref<any[]>([]),
  store = ref<any>({ deliveryFee: 15000 }),
  total = ref(0),
  page = ref(1),
  search = ref(''),
  category = ref<number | undefined>(),
  sort = ref('newest');
const loading = ref(true),
  busy = ref(false),
  error = ref(''),
  toast = ref(''),
  mobileMenu = ref(false),
  detail = ref<Product | null>(null),
  quantity = ref(1);
const orders = ref<any[]>([]),
  order = ref<any>(null),
  payments = ref<any[]>([]),
  adminProducts = ref<Product[]>([]),
  adminTab = computed(() => route.path.split('/')[2] || 'dashboard');
const email = ref(''),
  password = ref(''),
  name = ref(''),
  phone = ref(''),
  fulfillment = ref('PICKUP'),
  address = ref(''),
  notes = ref(''),
  ack = ref(false),
  proof = ref<File | null>(null),
  proofKey = ref(crypto.randomUUID());
const checkoutKey = ref(crypto.randomUUID()),
  editor = ref<any>(null),
  categoryEditor = ref<any>(null),
  rejectReason = ref(''),
  reviewId = ref<number | null>(null),
  adminStatus = ref(''),
  adminPage = ref(1),
  adminTotal = ref(0),
  stockDelta = ref(1),
  proofUrl = ref('');
const isAdmin = computed(() => route.path.startsWith('/admin')),
  isHome = computed(() => route.path === '/'),
  isAuthPage = computed(() => ['/login', '/register'].includes(route.path));
const orderTotal = computed(
  () => cart.subtotal + (fulfillment.value === 'LOCAL_DELIVERY' ? store.value.deliveryFee : 0),
);
const sampleProducts = [
  { id: 1, name: 'Strawberry Bliss', categoryId: 1 },
  { id: 2, name: 'Everyday Matcha', categoryId: 2 },
  { id: 3, name: 'Vanilla Cloud', categoryId: 1 },
];
let searchTimer: ReturnType<typeof setTimeout>, toastTimer: ReturnType<typeof setTimeout>;
function notify(message: string) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 4000);
}
async function action(fn: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await fn();
  } catch (e: any) {
    if (['INSUFFICIENT_STOCK', 'PRODUCT_UNAVAILABLE'].includes(e.code)) {
      await cart.refresh();
      await loadCatalog();
      error.value =
        e.message + ' Availability has been refreshed. Please review your bag before retrying.';
    } else error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function loadCatalog() {
  loading.value = true;
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: '8',
      sort: sort.value,
    });
    if (search.value) params.set('q', search.value);
    if (category.value) params.set('categoryId', String(category.value));
    const result = await api('/products?' + params);
    products.value = result.data;
    total.value = result.meta.total;
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
watch([category, sort], () => {
  page.value = 1;
  loadCatalog();
});
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    loadCatalog();
  }, 250);
});
watch(page, loadCatalog);
function add(p: Product, q = 1) {
  try {
    cart.add(p, q);
    notify(`${p.name} added to your bag`);
  } catch (e: any) {
    error.value = e.message;
  }
}
function selectCategory(id?: number) {
  category.value = id;
  document.querySelector('#collection')?.scrollIntoView({ behavior: 'smooth' });
}
async function loadOrders() {
  const result = await api(
    `${isAdmin.value ? '/admin' : ''}/orders?${new URLSearchParams({ page: String(adminPage.value), pageSize: '20', ...(adminStatus.value ? { status: adminStatus.value } : {}) })}`,
  );
  orders.value = result.data;
  adminTotal.value = result.meta.total;
}
async function loadAdmin() {
  if (adminTab.value === 'products') {
    const result = await api(`/admin/products?pageSize=20&page=${adminPage.value}`);
    adminProducts.value = result.data;
    adminTotal.value = result.meta.total;
  } else if (adminTab.value === 'payments') {
    const result = await api(`/admin/payments?pageSize=20&page=${adminPage.value}`);
    payments.value = result.data;
    adminTotal.value = result.meta.total;
  } else await loadOrders();
}
async function loadRoute() {
  error.value = '';
  detail.value = null;
  order.value = null;
  quantity.value = 1;
  mobileMenu.value = false;
  loading.value = true;
  try {
    if (!auth.ready) await auth.load();
    if (
      (isAdmin.value || ['/checkout', '/orders'].some((p) => route.path.startsWith(p))) &&
      !auth.user
    ) {
      await router.replace({ path: '/login', query: { redirect: route.fullPath } });
      return;
    }
    if (isAdmin.value && auth.user.role !== 'ADMIN') {
      error.value = 'Administrator access required.';
      return;
    }
    if (route.path.startsWith('/products/'))
      detail.value = (await api('/products/' + route.params.id)).data;
    else if (route.path.startsWith('/orders/'))
      order.value = (await api('/orders/' + route.params.id)).data;
    else if (route.path === '/orders') await loadOrders();
    else if (route.path === '/cart' || route.path === '/checkout') {
      await cart.refresh();
      name.value = auth.user?.name || name.value;
      phone.value = auth.user?.phone || phone.value;
    } else if (isAdmin.value) await loadAdmin();
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
watch(() => route.fullPath, loadRoute);
watch(adminStatus, () => {
  adminPage.value = 1;
  loadOrders().catch((e) => (error.value = e.message));
});
watch(adminPage, () => {
  (isAdmin.value ? loadAdmin() : loadOrders()).catch((e) => (error.value = e.message));
});
watch(
  () => route.path,
  () => {
    adminPage.value = 1;
  },
);
watch(
  [fulfillment, name, phone, address, notes, () => JSON.stringify(cart.items)],
  () => (checkoutKey.value = crypto.randomUUID()),
);
function sessionExpired() {
  auth.user = null;
  router.push({ path: '/login', query: { redirect: route.fullPath } });
}
window.addEventListener('sistabrew-auth-expired', sessionExpired);
onUnmounted(() => {
  window.removeEventListener('sistabrew-auth-expired', sessionExpired);
  clearTimeout(searchTimer);
  clearTimeout(toastTimer);
});
onMounted(async () => {
  await Promise.all([
    auth.load(),
    loadCatalog(),
    api('/categories').then((r) => (categories.value = r.data)),
    api('/store').then((r) => (store.value = r.data)),
  ]).catch((e) => (error.value = e.message));
  await loadRoute();
});
async function signIn() {
  await action(async () => {
    if (route.path === '/register') {
      await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: name.value,
          email: email.value.trim().toLowerCase(),
          password: password.value,
          ...(phone.value ? { phone: phone.value } : {}),
        }),
      });
      notify('Your account is ready. Welcome to SistaBrew!');
    }
    await auth.login(email.value.trim().toLowerCase(), password.value);
    const target = String(route.query.redirect || (auth.user.role === 'ADMIN' ? '/admin' : '/'));
    await router.push(target.startsWith('/') && !target.startsWith('//') ? target : '/');
  });
}
async function signOut() {
  await action(async () => {
    await auth.logout();
    await router.push('/');
    notify('You’re signed out. See you soon!');
  });
}
async function placeOrder() {
  await action(async () => {
    if (fulfillment.value === 'LOCAL_DELIVERY' && !ack.value)
      throw new Error('Please confirm that your address is in our delivery area.');
    const result = await api('/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': checkoutKey.value },
      body: JSON.stringify({
        items: cart.items,
        fulfillmentMethod: fulfillment.value,
        recipientName: name.value,
        recipientPhone: phone.value,
        ...(fulfillment.value === 'LOCAL_DELIVERY' ? { deliveryAddress: address.value } : {}),
        customerNotes: notes.value,
      }),
    });
    cart.clear();
    await router.push('/orders/' + result.data.id);
    notify('Order placed! Your products are reserved.');
  });
}
async function refreshOrder() {
  order.value = (await api('/orders/' + order.value.id)).data;
}
async function cancel() {
  await action(async () => {
    await api(`/orders/${order.value.id}/cancel`, { method: 'POST' });
    await refreshOrder();
    notify('Order cancelled. Stock has been restored.');
  });
}
async function uploadProof() {
  await action(async () => {
    if (!proof.value) throw new Error('Choose a payment proof image.');
    const data = new FormData();
    data.append('file', proof.value);
    await api(`/orders/${order.value.id}/payments`, {
      method: 'POST',
      headers: { 'Idempotency-Key': proofKey.value },
      body: data,
    });
    proof.value = null;
    proofKey.value = crypto.randomUUID();
    await refreshOrder();
    notify('Proof received. We’ll review your transfer.');
  });
}
function setProof(e: Event) {
  proof.value = (e.target as HTMLInputElement).files?.[0] || null;
  proofKey.value = crypto.randomUUID();
}
async function viewProof(id: number) {
  await action(async () => {
    proofUrl.value = (await api(`/payments/${id}/proof-url`)).data.url;
  });
}
function canCancel(o: any) {
  return (
    o.status === 'AWAITING_PAYMENT' &&
    !o.payments?.some((p: any) => ['PENDING_REVIEW', 'APPROVED'].includes(p.status))
  );
}
function next(o: any) {
  return (
    {
      CONFIRMED: 'PROCESSING',
      PROCESSING: o.fulfillmentMethod === 'PICKUP' ? 'READY_FOR_PICKUP' : 'OUT_FOR_DELIVERY',
      READY_FOR_PICKUP: 'COMPLETED',
      OUT_FOR_DELIVERY: 'COMPLETED',
    } as Record<string, string>
  )[o.status];
}
async function advance(o: any) {
  await action(async () => {
    await api(`/admin/orders/${o.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next(o) }),
    });
    await loadAdmin();
    notify('Order updated.');
  });
}
async function review(p: any, approve: boolean) {
  await action(async () => {
    await api(`/admin/payments/${p.id}/${approve ? 'approve' : 'reject'}`, {
      method: 'POST',
      ...(approve ? {} : { body: JSON.stringify({ rejectionReason: rejectReason.value }) }),
    });
    reviewId.value = null;
    rejectReason.value = '';
    await loadAdmin();
    notify(approve ? 'Payment approved. Order confirmed.' : 'Payment rejected with your reason.');
  });
}
const productImageFile = ref<File | null>(null);
const productImagePreview = ref('');
watch(productImageFile, (file, _previous, onCleanup) => {
  productImagePreview.value = file ? URL.createObjectURL(file) : '';
  if (productImagePreview.value) {
    const url = productImagePreview.value;
    onCleanup(() => URL.revokeObjectURL(url));
  }
});
watch(editor, (value) => {
  if (!value) productImageFile.value = null;
});
function closeManagementDialog() {
  if (busy.value) return;
  editor.value = null;
  categoryEditor.value = null;
  confirmDelete.value = null;
  proofUrl.value = '';
}
function editProduct(p?: Product) {
  productImageFile.value = null;
  error.value = '';
  editor.value = p
    ? { ...p }
    : {
        name: '',
        sku: '',
        description: '',
        categoryId: categories.value[0]?.id || 1,
        price: '',
        stock: 0,
        isActive: true,
      };
  stockDelta.value = 1;
}
function updateProductPrice(event: Event) {
  const input = event.target as HTMLInputElement;
  input.value = input.value.replace(/[^0-9]/g, '');
  editor.value.price = input.value;
}
async function saveProduct() {
  await action(async () => {
    const p = editor.value;
    const body = {
      name: p.name,
      sku: p.sku,
      description: p.description,
      categoryId: Number(p.categoryId),
      price: Number(p.price),
      isActive: p.isActive,
      ...(!p.id ? { stock: Number(p.stock) } : {}),
    };
    const image = productImageFile.value;
    const saved = await api('/admin/products' + (p.id ? '/' + p.id : ''), {
      method: p.id ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
    });
    // Keep the created ID if uploading fails so retrying cannot create a duplicate.
    editor.value = { ...p, id: saved.data.id };
    if (image) {
      const data = new FormData();
      data.append('file', image);
      try {
        await api(`/admin/products/${saved.data.id}/image`, { method: 'PUT', body: data });
      } catch {
        await loadAdmin();
        await loadCatalog();
        throw new Error(
          'Product saved, but the image could not be uploaded. Keep this form open and save again to retry.',
        );
      }
    }
    editor.value = null;
    await loadAdmin();
    notify('Product saved.');
    loadCatalog();
  });
}
async function adjustStock() {
  await action(async () => {
    const result = await api(`/admin/products/${editor.value.id}/stock-adjustments`, {
      method: 'POST',
      body: JSON.stringify({ delta: Number(stockDelta.value) }),
    });
    editor.value.stock = result.data.stock;
    await loadAdmin();
    notify('Stock adjusted.');
  });
}
function productImage(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 2 * 1024 * 1024
  ) {
    input.value = '';
    error.value = 'Choose a JPEG, PNG, or WebP image up to 2 MiB.';
    return;
  }
  error.value = '';
  productImageFile.value = file;
  input.value = '';
}
const confirmDelete = ref<{ type: string; id: number; name: string } | null>(null);
async function deleteRecord() {
  await action(async () => {
    await api(`/admin/${confirmDelete.value!.type}/${confirmDelete.value!.id}`, {
      method: 'DELETE',
    });
    confirmDelete.value = null;
    categories.value = (await api('/categories')).data;
    await loadAdmin();
    await loadCatalog();
    notify('Record deleted.');
  });
}
async function saveCategory() {
  await action(async () => {
    const c = categoryEditor.value;
    await api('/admin/categories' + (c.id ? '/' + c.id : ''), {
      method: c.id ? 'PATCH' : 'POST',
      body: JSON.stringify({ name: c.name, description: c.description || '' }),
    });
    categoryEditor.value = null;
    categories.value = (await api('/categories')).data;
    notify('Category saved.');
  });
}
</script>

<template>
  <div class="announcement">
    <Sparkles :size="13" /> Your next favorite drink starts here.
    <span>Made for your everyday creations.</span>
  </div>
  <header class="site-header">
    <div class="header-inner">
      <RouterLink to="/" class="brand"
        >SistaBrew<span class="brand-flower">✽</span
        ><small>GOOD THINGS START HERE</small></RouterLink
      >
      <nav class="desktop-nav">
        <RouterLink to="/" :class="{ active: isHome }">Shop all</RouterLink
        ><button @click="router.push('/').then(() => selectCategory(1))">Syrups</button
        ><button @click="router.push('/').then(() => selectCategory(2))">Drink powders</button
        ><button @click="router.push('/').then(() => selectCategory(3))">The little extras</button>
      </nav>
      <div class="header-actions">
        <RouterLink v-if="auth.user?.role === 'ADMIN'" to="/admin" class="account-link"
          >Studio</RouterLink
        ><RouterLink v-else-if="auth.user" to="/orders" class="account-link">My orders</RouterLink
        ><RouterLink v-else to="/login" class="account-link"
          >Sign in <ArrowUpRight :size="14" /></RouterLink
        ><button v-if="auth.user" class="icon-button logout" title="Sign out" @click="signOut">
          <LogOut :size="17" />
        </button>
        <div class="nav-divider"></div>
        <RouterLink to="/cart" class="bag-link"
          ><ShoppingBag :size="20" /><span class="bag-label">Your bag</span
          ><b>{{ cart.count }}</b></RouterLink
        ><button
          class="icon-button mobile-toggle"
          aria-label="Open menu"
          @click="mobileMenu = !mobileMenu"
        >
          <Menu :size="22" />
        </button>
      </div>
    </div>
    <nav v-if="mobileMenu" class="mobile-nav">
      <RouterLink to="/">Shop all</RouterLink><RouterLink to="/orders">My orders</RouterLink
      ><RouterLink v-if="!auth.user" to="/login">Sign in</RouterLink
      ><RouterLink v-if="auth.user?.role === 'ADMIN'" to="/admin">Admin studio</RouterLink
      ><button v-if="auth.user" @click="signOut">Sign out</button>
    </nav>
  </header>
  <div v-if="toast" class="toast" role="status">
    <CheckCircle :size="19" />{{ toast
    }}<button aria-label="Dismiss notification" @click="toast = ''"><X :size="16" /></button>
  </div>
  <div v-if="error" class="error-banner" role="alert">
    <AlertCircle :size="18" /><span>{{ error }}</span
    ><button aria-label="Dismiss error" @click="error = ''"><X :size="17" /></button>
  </div>

  <main v-if="isHome">
    <section class="hero wrap">
      <div class="hero-copy">
        <div class="eyebrow"><span></span> YOUR NEXT FAVORITE STARTS HERE</div>
        <h1>
          A little mix.<br />A lot of <em>happy.</em
          ><svg viewBox="0 0 240 14" class="happy-underline">
            <path
              d="M3 9Q108-3 235 7M33 13Q137 3 214 9"
              stroke="currentColor"
              stroke-width="2.5"
              fill="none"
              stroke-linecap="round"
            />
          </svg>
        </h1>
        <p>
          Lovely syrups, dreamy powders, and all the little<br class="desktop-only" />
          extras. Bring your café favorites home.
        </p>
        <button class="button primary" @click="selectCategory()">
          Find your flavor <ArrowRight :size="18" />
        </button>
        <div class="hero-note"><span class="tiny-spark">✽</span> A little joy in every pour.</div>
      </div>
      <div class="hero-visual">
        <div class="hero-orbit"></div>
        <div class="hero-spark spark-one">✧</div>
        <div class="hero-spark spark-two">✽</div>
        <div class="floating-note">
          your daily dose<br /><em>of delicious</em
          ><svg viewBox="0 0 80 60">
            <path
              d="M5 5Q65-4 62 45m-10-9 10 12 10-12"
              stroke="currentColor"
              stroke-width="1.5"
              fill="none"
            />
          </svg>
        </div>
        <div class="pedestal pedestal-back"></div>
        <div class="hero-matcha"><ProductArt :product="sampleProducts[1]" /></div>
        <div class="pedestal pedestal-front"></div>
        <div class="hero-bottle"><ProductArt :product="sampleProducts[0]" /></div>
        <div class="drink">
          <div class="straw"></div>
          <div class="glass">
            <div class="ice i1"></div>
            <div class="ice i2"></div>
            <div class="ice i3"></div>
            <div class="glass-shine"></div>
          </div>
          <div class="glass-shadow"></div>
          <div class="strawberry-leaf"></div>
        </div>
        <div class="hero-seal">
          <Heart :size="18" stroke-width="1.4" /><span
            >MIXED WITH<br />LOVE & A LITTLE<br />IMAGINATION</span
          >
        </div>
      </div>
    </section>
    <section class="benefits">
      <div class="wrap benefit-inner">
        <span><Leaf :size="19" /> Thoughtfully picked drink essentials</span><i>✧</i
        ><span><Heart :size="19" /> Small moments, made sweeter</span><i>✧</i
        ><span><Package :size="19" /> From our shelf to your happy place</span>
      </div>
    </section>
    <section id="collection" class="collection wrap">
      <div class="section-heading">
        <div>
          <div class="eyebrow">THE GOOD STUFF</div>
          <h2>Meet your new favorites<span>✽</span></h2>
          <p>For your home café, your small business, or just because.</p>
        </div>
        <span class="collection-note">A little something for every cup. <Heart :size="15" /></span>
      </div>
      <div class="catalog-toolbar">
        <div class="category-tabs">
          <button :class="{ selected: !category }" @click="category = undefined">
            All the good stuff <span>{{ !category ? total : '' }}</span></button
          ><button
            v-for="c in categories"
            :key="c.id"
            :class="{ selected: category === c.id }"
            @click="category = c.id"
          >
            {{ c.name }}
          </button>
        </div>
        <div class="catalog-controls">
          <label class="search-field"
            ><Search :size="17" /><input
              v-model="search"
              placeholder="Find your flavor…"
              aria-label="Search products" /><button
              v-if="search"
              aria-label="Clear search"
              @click="search = ''"
            >
              <X :size="15" /></button></label
          ><label class="sort-field"
            ><SlidersHorizontal :size="15" /><select v-model="sort" aria-label="Sort products">
              <option value="newest">Our favorites</option>
              <option value="nameAsc">Name: A–Z</option>
              <option value="priceAsc">Price: low to high</option>
              <option value="priceDesc">Price: high to low</option></select
            ><ChevronDown :size="13"
          /></label>
        </div>
      </div>
      <div v-if="loading && !products.length" class="product-grid">
        <div v-for="n in 8" :key="n" class="skeleton"></div>
      </div>
      <div v-else-if="!products.length" class="empty-state">
        <Search :size="34" />
        <h3>No flavors found</h3>
        <p>Try another search or explore all our products.</p>
        <button
          class="button secondary"
          @click="
            search = '';
            category = undefined;
          "
        >
          Reset filters
        </button>
      </div>
      <div v-else class="product-grid">
        <article v-for="p in products" :key="p.id" class="product-card">
          <RouterLink
            :to="'/products/' + p.id"
            class="product-picture"
            :class="'tone-' + ((p.id - 1) % 8)"
            ><span v-if="p.id === 1" class="product-badge">THE CROWD FAVORITE</span
            ><span v-else-if="p.id === 2" class="product-badge">YOUR DAILY RITUAL</span
            ><span v-if="!p.stock" class="sold-out-badge">Back soon</span
            ><ProductArt :product="p" /><span class="picture-arrow"
              ><ArrowUpRight :size="18" /></span
          ></RouterLink>
          <div class="product-info">
            <div class="product-category">
              {{ p.category?.name }}
              <span>· {{ p.categoryId === 1 ? '750 ml' : p.id === 2 ? '250 g' : '500 g' }}</span>
            </div>
            <RouterLink :to="'/products/' + p.id" class="product-title">{{ p.name }}</RouterLink>
            <div class="product-bottom">
              <span>{{ money(p.price) }}</span
              ><button
                :disabled="!p.stock"
                :aria-label="'Add ' + p.name + ' to bag'"
                @click="add(p)"
              >
                <Plus :size="18" />
              </button>
            </div>
          </div>
        </article>
      </div>
      <div class="catalog-bottom">
        <p>Great flavors. <em>Even better possibilities.</em></p>
        <div v-if="total > 8" class="pagination">
          <button :disabled="page === 1" aria-label="Previous page" @click="page--">
            <ChevronLeft :size="18" /></button
          ><span>{{ page }} / {{ Math.ceil(total / 8) }}</span
          ><button :disabled="page * 8 >= total" aria-label="Next page" @click="page++">
            <ChevronRight :size="18" />
          </button>
        </div>
        <span v-else class="result-count">{{ total }} little reasons to create</span>
      </div>
    </section>
    <section class="inspiration wrap">
      <div class="inspiration-art">
        <div class="mini-drink matcha-drink">
          <div class="mini-straw"></div>
          <div class="mini-glass"></div>
        </div>
        <span class="doodle-star">✧</span
        ><span class="doodle-love">made by you,<br />loved by you ♡</span>
      </div>
      <div class="inspiration-copy">
        <div class="eyebrow">YOUR COUNTER. YOUR LITTLE CAFÉ.</div>
        <h2>You bring the imagination.<br />We’ll bring the flavors.</h2>
        <p>
          A strawberry matcha for slow mornings. A caramel latte for a little pick-me-up. There’s a
          whole lot of happiness waiting in your next creation.
        </p>
        <button class="text-link" @click="selectCategory()">
          Let’s make something lovely <ArrowRight :size="17" />
        </button>
      </div>
    </section>
    <section class="closing-note">
      <span>✽</span>
      <p>Life’s a little sweeter<br />when you <em>make it your own.</em></p>
      <span>✧</span>
    </section>
  </main>

  <main v-else-if="route.path.startsWith('/products/')" class="wrap page-content">
    <RouterLink to="/" class="back-link"
      ><ChevronLeft :size="16" /> Back to the good stuff</RouterLink
    >
    <div v-if="detail" class="detail-grid">
      <div class="detail-art" :class="'tone-' + ((detail.id - 1) % 8)">
        <ProductArt :product="detail" />
      </div>
      <div class="detail-copy">
        <div class="eyebrow">{{ detail.category?.name }}</div>
        <h1>{{ detail.name }}</h1>
        <div class="detail-price">{{ money(detail.price) }}</div>
        <p>{{ detail.description }}</p>
        <div class="stock-note" :class="{ unavailable: !detail.stock }">
          <span></span
          >{{
            detail.stock
              ? detail.stock + ' packages ready for your creations'
              : 'Restocking a little happiness. Back soon!'
          }}
        </div>
        <div class="purchase-actions">
          <div class="stepper">
            <button :disabled="quantity <= 1" aria-label="Decrease quantity" @click="quantity--">
              <Minus :size="16" /></button
            ><span>{{ quantity }}</span
            ><button
              :disabled="quantity >= Math.min(detail.stock, 99)"
              aria-label="Increase quantity"
              @click="quantity++"
            >
              <Plus :size="16" />
            </button>
          </div>
          <button class="button primary" :disabled="!detail.stock" @click="add(detail, quantity)">
            Add to your bag <ShoppingBag :size="18" />
          </button>
        </div>
        <div class="detail-perks">
          <span><ShieldCheck :size="18" /> Carefully selected</span
          ><span><Package :size="18" /> Pickup or local delivery</span>
        </div>
        <div class="little-note">
          <Heart :size="18" />
          <p>
            A tiny tip: start with a little, taste, and make it yours. The best recipe is the one
            you love.
          </p>
        </div>
      </div>
    </div>
    <div v-else-if="loading" class="empty-state">Finding your flavor…</div>
  </main>

  <main v-else-if="isAuthPage" class="auth-layout wrap">
    <div class="auth-art">
      <span class="eyebrow">A LITTLE MORE YOU TIME</span>
      <h1>Your next happy<br />little ritual<br /><em>starts here.</em></h1>
      <ProductArt :product="sampleProducts[0]" /><span class="auth-spark">✽</span>
      <p>Great flavors. Lovely possibilities.</p>
    </div>
    <div class="auth-form">
      <div class="eyebrow">WELCOME TO SistaBrew</div>
      <h2>{{ route.path === '/register' ? 'Let’s make it lovely.' : 'Oh, hello again.' }}</h2>
      <p>
        {{
          route.path === '/register'
            ? 'Create an account for all your favorite little things.'
            : 'Sign in and pick up where your cravings left off.'
        }}
      </p>
      <form @submit.prevent="signIn">
        <label v-if="route.path === '/register'"
          >Your name<input
            v-model="name"
            required
            maxlength="100"
            autocomplete="name"
            placeholder="What should we call you?" /></label
        ><label
          >Email address<input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            placeholder="you@example.com" /></label
        ><label v-if="route.path === '/register'"
          >Phone number <span>(optional)</span
          ><input
            v-model="phone"
            type="tel"
            autocomplete="tel"
            placeholder="0812 3456 7890" /></label
        ><label
          >Password<input
            v-model="password"
            type="password"
            required
            minlength="12"
            maxlength="72"
            :autocomplete="route.path === '/register' ? 'new-password' : 'current-password'"
            placeholder="At least 12 characters" /></label
        ><button class="button primary full" :disabled="busy">
          {{
            busy
              ? 'One little moment…'
              : route.path === '/register'
                ? 'Create your account'
                : 'Sign in'
          }}<ArrowRight :size="17" />
        </button>
      </form>
      <p class="switch-auth">
        {{ route.path === '/register' ? 'Already part of the family?' : 'New around here?' }}
        <RouterLink :to="route.path === '/register' ? '/login' : '/register'">{{
          route.path === '/register' ? 'Sign in' : 'Make yourself at home'
        }}</RouterLink>
      </p>
      <div v-if="store.demo" class="demo-note">
        <span>DEMO ACCOUNTS</span>
        <p>
          Customer: alya@sistabrew.test<br />Admin: admin@sistabrew.test<br />Password:
          sistabrewDemo!2026
        </p>
      </div>
    </div>
  </main>

  <main v-else-if="route.path === '/cart'" class="wrap page-content">
    <div class="page-title">
      <div class="eyebrow">A BAG FULL OF POSSIBILITIES</div>
      <h1>Your happy little haul<span>♡</span></h1>
      <p>
        {{ cart.count }} lovely {{ cart.count === 1 ? 'thing' : 'things' }} for your next creation.
      </p>
    </div>
    <div v-if="!cart.items.length" class="empty-state">
      <ShoppingBag :size="42" />
      <h2>A little empty, a lot of potential.</h2>
      <p>Let’s find your next favorite flavor.</p>
      <RouterLink to="/" class="button primary"
        >Explore the good stuff <ArrowRight :size="17"
      /></RouterLink>
    </div>
    <div v-else class="checkout-grid">
      <div class="cart-lines">
        <div v-for="line in cart.lines" :key="line.productId" class="cart-line">
          <div class="cart-art" :class="'tone-' + ((line.productId - 1) % 8)">
            <ProductArt v-if="line.product" :product="line.product" />
          </div>
          <div class="cart-line-info">
            <RouterLink :to="'/products/' + line.productId">{{
              line.product?.name || 'Unavailable product'
            }}</RouterLink>
            <p>{{ line.product?.category?.name || 'Remove this item before checkout' }}</p>
            <span>{{ money(line.product?.price || 0) }}</span>
            <div v-if="line.product && line.quantity > line.product.stock" class="inline-error">
              Only {{ line.product.stock }} available. Adjust your quantity.
            </div>
          </div>
          <div class="stepper">
            <button
              aria-label="Decrease quantity"
              @click="cart.set(line.productId, line.quantity - 1)"
            >
              <Minus :size="14" /></button
            ><span>{{ line.quantity }}</span
            ><button
              :disabled="line.quantity >= Math.min(line.product?.stock || 0, 99)"
              aria-label="Increase quantity"
              @click="cart.set(line.productId, line.quantity + 1)"
            >
              <Plus :size="14" />
            </button>
          </div>
          <strong>{{ money((line.product?.price || 0) * line.quantity) }}</strong
          ><button
            class="icon-button"
            :aria-label="'Remove ' + line.product?.name"
            @click="cart.set(line.productId, 0)"
          >
            <X :size="17" />
          </button>
        </div>
        <RouterLink to="/" class="back-link"
          ><ChevronLeft :size="16" /> A little more browsing</RouterLink
        >
      </div>
      <aside class="summary-card">
        <h3>The lovely details</h3>
        <div>
          <span>Subtotal</span><strong>{{ money(cart.subtotal) }}</strong>
        </div>
        <div><span>Delivery</span><span>Chosen at checkout</span></div>
        <div class="summary-total">
          <span>Subtotal</span><strong>{{ money(cart.subtotal) }}</strong>
        </div>
        <RouterLink to="/checkout" class="button primary full"
          >Let’s check out <ArrowRight :size="17"
        /></RouterLink>
        <p><ShieldCheck :size="15" /> Manual bank transfer · Secure checkout</p>
      </aside>
    </div>
  </main>

  <main v-else-if="route.path === '/checkout'" class="wrap page-content">
    <RouterLink to="/cart" class="back-link"
      ><ChevronLeft :size="16" /> Back to your bag</RouterLink
    >
    <div class="page-title">
      <div class="eyebrow">ONE STEP CLOSER TO SOMETHING LOVELY</div>
      <h1>Make it yours.</h1>
      <p>Just a few details, and we’ll take it from here.</p>
    </div>
    <form v-if="cart.items.length" class="checkout-grid" @submit.prevent="placeOrder">
      <div class="checkout-fields">
        <section class="form-section">
          <h3><span>01</span> Your details</h3>
          <div class="two-fields">
            <label
              >Recipient name<input
                v-model="name"
                required
                maxlength="100"
                autocomplete="name" /></label
            ><label
              >Phone number<input
                v-model="phone"
                required
                type="tel"
                maxlength="30"
                autocomplete="tel"
                placeholder="0812 3456 7890"
            /></label>
          </div>
        </section>
        <section class="form-section">
          <h3><span>02</span> A little pickup or a special delivery?</h3>
          <div class="fulfillment-options">
            <label :class="{ selected: fulfillment === 'PICKUP' }"
              ><input v-model="fulfillment" type="radio" value="PICKUP" /><Package
                :size="23"
              /><strong>Store pickup</strong><span>A little visit, on us.</span><b>Free</b></label
            ><label :class="{ selected: fulfillment === 'LOCAL_DELIVERY' }"
              ><input v-model="fulfillment" type="radio" value="LOCAL_DELIVERY" /><Truck
                :size="23"
              /><strong>Local delivery</strong><span>Happiness to your doorstep.</span
              ><b>{{ money(store.deliveryFee) }}</b></label
            >
          </div>
          <div class="store-location">
            <MapPin :size="18" />
            <div>
              <strong>{{
                fulfillment === 'PICKUP' ? 'Come say hello' : 'Our little delivery neighborhood'
              }}</strong>
              <p>{{ fulfillment === 'PICKUP' ? store.address : store.serviceArea }}</p>
            </div>
          </div>
          <template v-if="fulfillment === 'LOCAL_DELIVERY'"
            ><label
              >Complete delivery address<textarea
                v-model="address"
                required
                minlength="10"
                maxlength="1000"
                rows="3"
                autocomplete="street-address"
                placeholder="Street, building, area, and postcode"
              ></textarea></label
            ><label class="checkbox-label"
              ><input v-model="ack" type="checkbox" required />I confirm my address is within the
              delivery area above.</label
            ></template
          >
        </section>
        <section class="form-section">
          <h3><span>03</span> Anything we should know?</h3>
          <label
            >Order notes <span>(optional)</span
            ><textarea
              v-model="notes"
              rows="3"
              maxlength="1000"
              placeholder="A little note for us…"
            ></textarea>
          </label>
        </section>
      </div>
      <aside class="summary-card">
        <h3>Your little happiness list</h3>
        <div v-for="line in cart.lines" :key="line.productId">
          <span
            >{{ line.product?.name || 'Unavailable' }} <small>× {{ line.quantity }}</small></span
          ><strong>{{ money((line.product?.price || 0) * line.quantity) }}</strong>
        </div>
        <hr />
        <div>
          <span>Subtotal</span><strong>{{ money(cart.subtotal) }}</strong>
        </div>
        <div>
          <span>Delivery</span
          ><strong>{{ fulfillment === 'PICKUP' ? 'On us' : money(store.deliveryFee) }}</strong>
        </div>
        <div class="summary-total">
          <span>Total</span><strong>{{ money(orderTotal) }}</strong>
        </div>
        <div class="payment-explainer">
          <Wallet :size="21" />
          <div>
            <strong>{{ store.demo ? 'Demo payment' : 'Bank transfer' }}</strong>
            <p v-if="store.demo">
              Place your order, then upload a sample image as your receipt. No real payment is
              needed.
            </p>
            <p v-else>
              Place your order, then transfer and upload your receipt. We’ll personally check your
              payment.
            </p>
          </div>
        </div>
        <button
          class="button primary full"
          :disabled="busy || cart.lines.some((l) => !l.product || l.quantity > l.product.stock)"
        >
          {{ busy ? 'Saving your order…' : 'Place your order' }}<ArrowRight :size="17" />
        </button>
        <p v-if="store.demo">Demo store. Please don’t make a real transfer.</p>
      </aside>
    </form>
    <div v-else class="empty-state">
      <p>Your bag is waiting for a little inspiration.</p>
      <RouterLink to="/" class="button primary">Explore products</RouterLink>
    </div>
  </main>

  <main v-else-if="route.path === '/orders'" class="wrap page-content">
    <div class="page-title">
      <div class="eyebrow">YOUR LITTLE COLLECTION OF HAPPY</div>
      <h1>Your orders.</h1>
      <p>From our shelf to your favorite cup.</p>
    </div>
    <div v-if="!orders.length" class="empty-state">
      <Receipt :size="40" />
      <h2>Your first lovely order is waiting.</h2>
      <RouterLink to="/" class="button primary"
        >Find your flavor <ArrowRight :size="17"
      /></RouterLink>
    </div>
    <div v-else class="orders-list">
      <RouterLink v-for="o in orders" :key="o.id" :to="'/orders/' + o.id" class="order-card"
        ><div>
          <span class="eyebrow">{{ o.orderNumber }}</span>
          <h3>
            {{ o.items.length }}
            {{ o.items.length === 1 ? 'product' : 'products' }}
          </h3>
          <p>
            {{
              new Date(o.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            }}
            · {{ label(o.fulfillmentMethod) }}
          </p>
        </div>
        <span class="status" :class="o.status.toLowerCase()">{{ label(o.status) }}</span
        ><strong>{{ money(o.total) }}</strong
        ><ArrowUpRight :size="20"
      /></RouterLink>
    </div>
    <div v-if="adminTotal > 20" class="pagination">
      <button :disabled="adminPage === 1" @click="adminPage--">Previous</button
      ><span>{{ adminPage }}</span
      ><button :disabled="adminPage * 20 >= adminTotal" @click="adminPage++">Next</button>
    </div>
  </main>

  <main v-else-if="route.path.startsWith('/orders/')" class="wrap page-content">
    <RouterLink to="/orders" class="back-link"
      ><ChevronLeft :size="16" /> All your orders</RouterLink
    ><template v-if="order"
      ><div class="page-title">
        <div class="eyebrow">{{ order.orderNumber }}</div>
        <h1>
          {{
            order.status === 'AWAITING_PAYMENT'
              ? 'A little happiness, reserved.'
              : order.status === 'CANCELLED'
                ? 'Until your next creation.'
                : 'Lovely things are on their way.'
          }}
        </h1>
        <p>
          <span class="status" :class="order.status.toLowerCase()">{{ label(order.status) }}</span>
        </p>
      </div>
      <div class="checkout-grid">
        <div>
          <section class="order-section">
            <h3>Your products</h3>
            <div v-for="item in order.items" :key="item.id" class="order-item">
              <div>
                <strong>{{ item.productName }}</strong>
                <p>{{ money(item.unitPrice) }} × {{ item.quantity }}</p>
              </div>
              <strong>{{ money(item.lineTotal) }}</strong>
            </div>
            <div class="order-item">
              <span>Delivery</span><strong>{{ money(order.deliveryFee) }}</strong>
            </div>
            <div class="order-item">
              <strong>Total</strong><strong>{{ money(order.total) }}</strong>
            </div>
          </section>
          <section class="order-section">
            <h3>
              {{
                order.fulfillmentMethod === 'PICKUP'
                  ? 'See you at the store'
                  : 'A special delivery for'
              }}
            </h3>
            <p>{{ order.recipientName }} · {{ order.recipientPhone }}</p>
            <p>
              {{ order.fulfillmentMethod === 'PICKUP' ? store.address : order.deliveryAddress }}
            </p>
            <p v-if="order.customerNotes">Your note: {{ order.customerNotes }}</p>
          </section>
          <section class="order-section">
            <div class="inline-heading">
              <h3>Payment updates</h3>
              <button class="text-link" :disabled="busy" @click="action(refreshOrder)">
                Refresh <Clock :size="14" />
              </button>
            </div>
            <p v-if="!order.payments.length" class="muted">
              No payment proof yet. We’re ready when you are.
            </p>
            <div v-for="p in order.payments" :key="p.id" class="payment-attempt">
              <div>
                <span class="status" :class="p.status.toLowerCase()">{{ label(p.status) }}</span>
                <p>{{ new Date(p.submittedAt).toLocaleString() }}</p>
                <p v-if="p.rejectionReason" class="inline-error">{{ p.rejectionReason }}</p>
              </div>
              <button class="text-link" @click="viewProof(p.id)">
                View proof <ArrowUpRight :size="14" />
              </button>
            </div>
          </section>
        </div>
        <aside>
          <div v-if="order.status === 'AWAITING_PAYMENT'" class="summary-card">
            <div class="eyebrow">ONE LAST LITTLE STEP</div>
            <h3>{{ store.demo ? 'Try a demo payment.' : 'A transfer, then a hello.' }}</h3>
            <p v-if="store.demo">
              Upload a sample image to try payment review. Please don’t make a real transfer.
            </p>
            <p v-else>
              Transfer the exact total below, then share a photo of your payment receipt.
            </p>
            <div>
              <span>Bank</span><strong>{{ order.bank?.name }}</strong>
            </div>
            <div>
              <span>Account</span><strong>{{ order.bank?.accountNumber }}</strong>
            </div>
            <div>
              <span>Account holder</span><strong>{{ order.bank?.accountHolder }}</strong>
            </div>
            <div class="summary-total">
              <span>Transfer amount</span><strong>{{ money(order.total) }}</strong>
            </div>
            <div v-if="store.demo" class="demo-note">Demo only. No real payment is required.</div>
            <form
              v-if="canCancel(order) && auth.user?.id === order.userId"
              @submit.prevent="uploadProof"
            >
              <label class="upload-zone"
                ><Upload :size="25" /><strong>{{
                  proof?.name || 'Drop a little proof here'
                }}</strong
                ><span>Choose JPEG, PNG, or WebP · Max 2 MiB</span
                ><input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  @change="setProof" /></label
              ><button class="button primary full" :disabled="busy || !proof">
                {{ busy ? 'Uploading…' : 'Send payment proof' }}<ArrowRight :size="16" />
              </button>
            </form>
            <div v-else class="pending-note">
              <Clock :size="20" />
              <p>
                {{
                  auth.user?.role === 'ADMIN'
                    ? 'Awaiting the customer’s transfer or payment review. Use the studio payment queue to verify submitted proof.'
                    : 'Your proof is in good hands. We’ll confirm your payment after checking the transfer.'
                }}
              </p>
            </div>
          </div>
          <div v-else class="summary-card">
            <Heart :size="32" />
            <h3>
              {{
                order.status === 'CANCELLED'
                  ? 'A fresh start, whenever you’re ready.'
                  : 'Thanks for choosing SistaBrew.'
              }}
            </h3>
            <p>
              {{
                order.status === 'CANCELLED'
                  ? 'Your reserved products are back on our shelf.'
                  : 'We’re preparing a little something lovely for you.'
              }}
            </p>
            <RouterLink to="/" class="button secondary full">Back to the good stuff</RouterLink>
          </div>
          <button
            v-if="canCancel(order)"
            class="cancel-order"
            :disabled="busy"
            @click="confirmDelete = { type: 'cancel', id: order.id, name: order.orderNumber }"
          >
            Cancel this order
          </button>
        </aside>
      </div></template
    >
    <div v-else-if="loading" class="empty-state">Gathering the lovely details…</div>
  </main>

  <main v-else-if="isAdmin" class="admin-layout wrap">
    <aside class="admin-sidebar">
      <div class="eyebrow">BEHIND THE GOOD STUFF</div>
      <h2>The studio<span>✽</span></h2>
      <p>Your little shop, thoughtfully managed.</p>
      <nav>
        <RouterLink to="/admin" :class="{ selected: adminTab === 'dashboard' }"
          ><LayoutDashboard :size="18" /> Overview</RouterLink
        ><RouterLink to="/admin/products"><Boxes :size="18" /> Products</RouterLink
        ><RouterLink to="/admin/categories"><Tags :size="18" /> Categories</RouterLink
        ><RouterLink to="/admin/orders"><Receipt :size="18" /> Orders</RouterLink
        ><RouterLink to="/admin/payments"><Wallet :size="18" /> Payment review</RouterLink>
      </nav>
      <div class="admin-note">
        <Heart :size="20" />
        <p>Little details.<br />A lovely experience.</p>
      </div>
    </aside>
    <div v-if="auth.user?.role === 'ADMIN'" class="admin-main">
      <template v-if="adminTab === 'dashboard'"
        ><div class="page-title">
          <div class="eyebrow">WELCOME BACK, {{ auth.user.name }}</div>
          <h1>Let’s make today lovely.</h1>
          <p>Here’s what needs a little attention.</p>
        </div>
        <div class="stats-grid">
          <RouterLink to="/admin/orders"
            ><Receipt :size="21" /><span>All orders</span><strong>{{ adminTotal }}</strong
            ><ArrowUpRight :size="18" /></RouterLink
          ><RouterLink to="/admin/payments"
            ><Wallet :size="21" /><span>Payment review</span><strong>Review queue</strong
            ><ArrowUpRight :size="18" /></RouterLink
          ><RouterLink to="/admin/products"
            ><Package :size="21" /><span>Keep it stocked</span><strong>Your products</strong
            ><ArrowUpRight :size="18"
          /></RouterLink>
        </div>
        <h3 class="admin-section-title">The latest little orders</h3>
        <div v-if="!orders.length" class="empty-state">
          <Receipt :size="34" />
          <h3>A fresh little start.</h3>
          <p>Orders will appear here when customers check out.</p>
        </div></template
      >
      <template v-else-if="adminTab === 'products'"
        ><div class="admin-heading">
          <div>
            <div class="eyebrow">THE PRODUCT COLLECTION</div>
            <h1>Your good stuff.</h1>
            <p>Keep the flavors fresh and the shelves happy.</p>
          </div>
          <button class="button primary" @click="editProduct()">
            <Plus :size="17" /> New product
          </button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in adminProducts" :key="p.id">
                <td>
                  <strong>{{ p.name }}</strong
                  ><small>{{ p.sku }} · {{ p.category?.name }}</small>
                </td>
                <td>{{ money(p.price) }}</td>
                <td>{{ p.stock }}</td>
                <td>
                  <span class="status" :class="p.isActive ? 'completed' : 'cancelled'">{{
                    p.isActive ? 'Active' : 'Inactive'
                  }}</span>
                </td>
                <td>
                  <button class="text-link" @click="editProduct(p)">Edit</button
                  ><button
                    class="text-link danger"
                    @click="confirmDelete = { type: 'products', id: p.id, name: p.name }"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div></template
      >
      <template v-else-if="adminTab === 'categories'"
        ><div class="admin-heading">
          <div>
            <div class="eyebrow">A PLACE FOR EVERY FLAVOR</div>
            <h1>Lovely little categories.</h1>
          </div>
          <button class="button primary" @click="categoryEditor = { name: '', description: '' }">
            <Plus :size="17" /> New category
          </button>
        </div>
        <div class="category-admin-grid">
          <article v-for="c in categories" :key="c.id">
            <Tags :size="24" />
            <h3>{{ c.name }}</h3>
            <p>{{ c.description }}</p>
            <div>
              <button class="text-link" @click="categoryEditor = { ...c }">Edit category</button
              ><button
                class="text-link danger"
                @click="confirmDelete = { type: 'categories', id: c.id, name: c.name }"
              >
                Delete
              </button>
            </div>
          </article>
        </div></template
      >
      <template v-else-if="adminTab === 'orders'"
        ><div class="admin-heading">
          <div>
            <div class="eyebrow">FROM OUR SHELF TO THEIR CUP</div>
            <h1>A little order, a lot of joy.</h1>
          </div>
          <select v-model="adminStatus" aria-label="Filter orders by status">
            <option value="">All statuses</option>
            <option
              v-for="s in [
                'AWAITING_PAYMENT',
                'CONFIRMED',
                'PROCESSING',
                'READY_FOR_PICKUP',
                'OUT_FOR_DELIVERY',
                'COMPLETED',
                'CANCELLED',
              ]"
              :key="s"
              :value="s"
            >
              {{ label(s) }}
            </option>
          </select>
        </div>
        <div v-if="!orders.length" class="empty-state">
          <Receipt :size="32" />
          <h3>No orders here just yet.</h3>
        </div></template
      >
      <template v-else-if="adminTab === 'payments'"
        ><div class="admin-heading">
          <div>
            <div class="eyebrow">A PERSONAL LITTLE CHECK</div>
            <h1>Payment review.</h1>
            <p>Verify the bank transfer before approving the proof.</p>
          </div>
          <button class="button secondary" @click="action(loadAdmin)">Refresh</button>
        </div>
        <div v-if="!payments.length" class="empty-state">
          <CheckCircle :size="38" />
          <h3>All caught up. How lovely.</h3>
          <p>New payment proofs will appear here.</p>
        </div>
        <article v-for="p in payments" :key="p.id" class="review-card">
          <div>
            <span class="eyebrow">{{ p.order.orderNumber }}</span>
            <h3>{{ p.order.recipientName }}</h3>
            <p>{{ money(p.amount) }} · {{ new Date(p.submittedAt).toLocaleString() }}</p>
          </div>
          <button class="text-link" @click="viewProof(p.id)">
            View payment proof <ArrowUpRight :size="15" />
          </button>
          <div class="review-actions">
            <button class="button secondary" @click="reviewId = p.id">Reject</button
            ><button class="button primary" :disabled="busy" @click="review(p, true)">
              <Check :size="16" /> Approve transfer
            </button>
          </div>
          <form v-if="reviewId === p.id" class="rejection-form" @submit.prevent="review(p, false)">
            <label
              >Reason for rejection<textarea
                v-model="rejectReason"
                required
                maxlength="1000"
                placeholder="Explain what the customer should correct."
              ></textarea></label
            ><button class="button secondary" :disabled="busy">Send rejection</button>
          </form>
        </article></template
      >
      <div v-if="['dashboard', 'orders'].includes(adminTab) && orders.length" class="admin-orders">
        <article v-for="o in orders" :key="o.id" class="admin-order">
          <div class="inline-heading">
            <div>
              <RouterLink :to="'/orders/' + o.id" class="eyebrow"
                >{{ o.orderNumber }} ↗</RouterLink
              >
              <h3>{{ o.recipientName }}</h3>
              <p>
                {{ label(o.fulfillmentMethod) }} ·
                {{ o.items.map((i: any) => i.productName + ' × ' + i.quantity).join(', ') }}
              </p>
            </div>
            <strong>{{ money(o.total) }}</strong>
          </div>
          <div class="inline-heading">
            <span class="status" :class="o.status.toLowerCase()">{{ label(o.status) }}</span
            ><button
              v-if="next(o)"
              class="button secondary small"
              :disabled="busy"
              @click="advance(o)"
            >
              Mark {{ label(next(o)).toLowerCase() }} <ArrowRight :size="15" /></button
            ><button
              v-if="canCancel(o)"
              class="text-link danger"
              @click="
                order = o;
                confirmDelete = { type: 'cancel', id: o.id, name: o.orderNumber };
              "
            >
              Cancel order
            </button>
          </div>
        </article>
      </div>
      <div v-if="adminTab !== 'categories' && adminTotal > 20" class="pagination">
        <button :disabled="adminPage === 1" @click="adminPage--">Previous</button
        ><span>{{ adminPage }}</span
        ><button :disabled="adminPage * 20 >= adminTotal" @click="adminPage++">Next</button>
      </div>
    </div>
  </main>
  <main v-else class="wrap empty-state">
    <span class="not-found">404</span>
    <h1>A little lost?</h1>
    <p>Let’s get you back to something lovely.</p>
    <RouterLink to="/" class="button primary"
      >Back to the shop <ArrowRight :size="17"
    /></RouterLink>
  </main>

  <footer class="site-footer">
    <div class="wrap footer-top">
      <div>
        <RouterLink to="/" class="brand">SistaBrew<span class="brand-flower">✽</span></RouterLink>
        <p>Lovely flavors.<br />Everyday happiness.</p>
        <span class="footer-signature">With love, from our little shop to yours. ♡</span>
      </div>
      <div>
        <h4>The good stuff</h4>
        <button @click="router.push('/').then(() => selectCategory())">Shop all products</button
        ><button @click="router.push('/').then(() => selectCategory(1))">Syrups</button
        ><button @click="router.push('/').then(() => selectCategory(2))">Drink powders</button
        ><button @click="router.push('/').then(() => selectCategory(3))">Beverage additives</button>
      </div>
      <div>
        <h4>A little help</h4>
        <RouterLink to="/orders">Your orders</RouterLink
        ><RouterLink to="/cart">Your shopping bag</RouterLink
        ><RouterLink to="/login">Your account</RouterLink><span>Pickup & local delivery</span>
      </div>
      <div class="footer-message">
        <h4>Let’s make something lovely.</h4>
        <p>For slow mornings, busy afternoons,<br />and all the little moments in between.</p>
        <span class="footer-flower">✽</span>
      </div>
    </div>
    <div class="wrap footer-bottom">
      <span>© {{ new Date().getFullYear() }} SistaBrew. Made with a little love.</span
      ><span>{{
        store.demo
          ? 'A fictional shop. A real love for good drinks.'
          : 'Great flavors. Endless possibilities.'
      }}</span
      ><span>INDONESIA · IDR</span>
    </div>
  </footer>

  <div
    v-if="editor || categoryEditor || confirmDelete || proofUrl"
    class="modal-backdrop"
    @click.self="closeManagementDialog"
    @keydown.esc="closeManagementDialog"
  >
    <section class="modal" role="dialog" aria-modal="true" aria-label="Shop management dialog">
      <button
        class="modal-close icon-button"
        aria-label="Close dialog"
        :disabled="busy"
        @click="closeManagementDialog"
      >
        <X :size="22" />
      </button>
      <div v-if="error" class="modal-error" role="alert">{{ error }}</div>
      <template v-if="editor"
        ><div class="eyebrow">A LITTLE SHELF EDIT</div>
        <h2>{{ editor.id ? 'Edit product' : 'Something new & lovely' }}</h2>
        <form class="product-editor-form" @submit.prevent="saveProduct">
          <label>Product name<input v-model="editor.name" required maxlength="150" /></label>
          <div class="two-fields">
            <label>SKU<input v-model="editor.sku" required maxlength="50" /></label
            ><label
              >Category<select v-model="editor.categoryId">
                <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select></label
            >
          </div>
          <label
            >Description & package details<textarea
              v-model="editor.description"
              required
              maxlength="5000"
              rows="3"
            ></textarea>
          </label>
          <div class="two-fields">
            <label
              >Price (IDR)<input
                :value="editor.price"
                type="text"
                inputmode="numeric"
                pattern="0*(?:[1-9][0-9]{0,6}|10000000)"
                title="Enter a price from 1 to 10000000 using digits only."
                @input="updateProductPrice"
                required /></label
            ><label v-if="!editor.id"
              >Initial stock<input
                v-model.number="editor.stock"
                type="number"
                min="0"
                max="1000000"
                required
            /></label>
          </div>
          <div class="product-image-field">
            <div class="product-field-heading">
              <span>Product image</span><span class="field-optional">Optional</span>
            </div>
            <label
              class="product-image-picker"
              :class="{ 'has-image': productImagePreview || editor.imageUrl }"
            >
              <img
                v-if="productImagePreview || editor.imageUrl"
                :src="productImagePreview || editor.imageUrl"
                alt="Product image preview"
                class="product-image-preview"
              />
              <span v-else class="product-image-icon"><Upload :size="24" /></span>
              <span class="product-image-copy">
                <strong>{{
                  productImageFile?.name ||
                  (editor.imageUrl ? 'Choose a new image' : 'Choose a product image')
                }}</strong>
                <span>JPEG, PNG, or WebP · Up to 2 MiB</span>
                <span v-if="productImageFile"
                  >Ready to upload when you
                  {{ editor.id ? 'save changes' : 'create the product' }}.</span
                >
                <span v-else-if="editor.imageUrl"
                  >Your current image stays until you save a replacement.</span
                >
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Product image"
                :disabled="busy"
                @change="productImage"
              />
            </label>
            <button
              v-if="productImageFile"
              type="button"
              class="text-link product-image-clear"
              :disabled="busy"
              @click="productImageFile = null"
            >
              <X :size="13" /> Clear selection
            </button>
          </div>
          <label class="checkbox-label"
            ><input v-model="editor.isActive" type="checkbox" /> Visible in the shop</label
          ><button class="button primary full" :disabled="busy">
            {{ busy ? 'Saving…' : editor.id ? 'Save changes' : 'Create' }} <Check :size="17" />
          </button>
        </form>
        <div v-if="editor.id" class="stock-editor">
          <h3>Stock: {{ editor.stock }} packages</h3>
          <div class="stock-adjust">
            <input
              v-model.number="stockDelta"
              type="number"
              min="-1000000"
              max="1000000"
              aria-label="Stock adjustment"
            /><button class="button secondary" :disabled="busy" @click="adjustStock">
              Adjust stock
            </button>
          </div>
          <p>Add a positive number to restock, a negative number to remove.</p>
        </div>
      </template>
      <template v-else-if="categoryEditor"
        ><div class="eyebrow">A PLACE FOR EVERY FLAVOR</div>
        <h2>{{ categoryEditor.id ? 'Edit category' : 'New category' }}</h2>
        <form @submit.prevent="saveCategory">
          <label>Name<input v-model="categoryEditor.name" required maxlength="100" /></label
          ><label
            >Description<textarea
              v-model="categoryEditor.description"
              maxlength="2000"
              rows="3"
            ></textarea></label
          ><button class="button primary full" :disabled="busy">
            Save category <Check :size="17" />
          </button></form
      ></template>
      <template v-else-if="confirmDelete"
        ><div class="eyebrow">ONE LITTLE CHECK</div>
        <h2>
          {{ confirmDelete.type === 'cancel' ? 'Cancel this order?' : 'Delete this record?' }}
        </h2>
        <p>{{ confirmDelete.name }}</p>
        <p>
          {{
            confirmDelete.type === 'cancel'
              ? 'Your products will return to the shelf.'
              : 'This record will be permanently removed if it has no references.'
          }}
        </p>
        <div class="modal-actions">
          <button class="button secondary" @click="confirmDelete = null">Keep it</button
          ><button
            class="button primary"
            :disabled="busy"
            @click="
              confirmDelete?.type === 'cancel'
                ? action(async () => {
                    await api('/orders/' + confirmDelete!.id + '/cancel', { method: 'POST' });
                    confirmDelete = null;
                    if (isAdmin) await loadAdmin();
                    else await refreshOrder();
                    notify('Order cancelled.');
                  })
                : deleteRecord()
            "
          >
            {{ confirmDelete.type === 'cancel' ? 'Yes, cancel order' : 'Yes, delete' }}
          </button>
        </div></template
      >
      <template v-else-if="proofUrl"
        ><h2>Payment proof</h2>
        <img :src="proofUrl" class="proof-image" alt="Submitted payment receipt" />
        <p class="muted">Private proof. Verify receipt independently before approving.</p></template
      >
    </section>
  </div>
</template>

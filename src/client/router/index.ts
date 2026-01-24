import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { TOOL_UI_CONFIG } from '../composables/useTools';
import { useAuthStore } from '../stores/auth';

/** Helper to get tool meta by route path */
function getToolMeta(route: string) {
  const tool = Object.values(TOOL_UI_CONFIG).find((t) => t.route === route);
  return tool ? { title: tool.title, description: tool.description } : {};
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { title: 'Login', public: true },
  },
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/HomeView.vue'),
    meta: { title: 'Dashboard' },
  },
  {
    path: '/duplicates',
    name: 'Duplicates',
    component: () => import('../views/DuplicatesView.vue'),
    meta: getToolMeta('/duplicates'),
  },
  {
    path: '/subscriptions',
    name: 'Subscriptions',
    component: () => import('../views/SubscriptionsView.vue'),
    meta: getToolMeta('/subscriptions'),
  },
  {
    path: '/categories',
    name: 'Categories',
    component: () => import('../views/CategoriesView.vue'),
    meta: getToolMeta('/categories'),
  },
  {
    path: '/tags',
    name: 'Tags',
    component: () => import('../views/TagsView.vue'),
    meta: getToolMeta('/tags'),
  },
  {
    path: '/amazon',
    name: 'Amazon',
    component: () => import('../views/AmazonView.vue'),
    meta: getToolMeta('/amazon'),
  },
  {
    path: '/paypal',
    name: 'PayPal',
    component: () => import('../views/PayPalView.vue'),
    meta: getToolMeta('/paypal'),
  },
  {
    path: '/converter',
    name: 'Converter',
    component: () => import('../views/ConverterView.vue'),
    meta: getToolMeta('/converter'),
  },
  {
    path: '/fints',
    name: 'FinTS',
    component: () => import('../views/FinTSView.vue'),
    meta: getToolMeta('/fints'),
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { title: 'Settings' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Navigation guard for authentication
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // Update document title
  document.title = `${to.meta.title || 'FireflyIII Toolbox'} - FireflyIII Toolbox`;

  // Wait for auth to be initialized if not already
  if (!authStore.initialized) {
    await authStore.fetchAuthStatus();
  }

  // Public routes don't require authentication
  if (to.meta.public) {
    // If already authenticated and trying to access login, redirect to home
    if (to.name === 'Login' && authStore.isAuthenticated) {
      return next('/');
    }
    return next();
  }

  // Check authentication for protected routes
  if (!authStore.isAuthenticated) {
    // Redirect to login with the original path as redirect query
    return next({
      name: 'Login',
      query: { redirect: to.fullPath },
    });
  }

  next();
});

export default router;

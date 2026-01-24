import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import App from './App.vue';
import router from './router';
import vuetifyDefault, { createVuetifyInstance } from './plugins/vuetify';
import { initializeApi } from './services/api';
import { useAuthStore } from './stores';

import './styles/main.scss';

declare const __DEV__: boolean;

async function bootstrap() {
  const app = createApp(App);

  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);
  app.use(pinia);

  // Initialize stores
  const authStore = useAuthStore();

  // Initialize API with auth handler (must be after Pinia is installed)
  // Session identity is managed server-side via Express session cookies
  initializeApi(() => {
    // Handle 401 unauthorized responses
    authStore.handleUnauthorized();
    router.push('/login');
  });

  app.use(router);

  // In development, load all Vuetify components to avoid constant HMR reloads
  // In production, use tree-shaken version via vite-plugin-vuetify
  // __DEV__ is replaced at build time for proper dead code elimination
  if (__DEV__) {
    const [components, directives] = await Promise.all([
      import('vuetify/components'),
      import('vuetify/directives'),
    ]);
    app.use(createVuetifyInstance(components, directives));
  } else {
    app.use(vuetifyDefault);
  }

  app.mount('#app');
}

bootstrap();

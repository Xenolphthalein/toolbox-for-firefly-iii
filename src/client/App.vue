<template>
  <v-app :theme="appStore.vuetifyThemeName">
    <!-- Hide navigation and header on login page -->
    <template v-if="!isLoginPage">
      <AppNavigation />
      <AppHeader />
    </template>

    <v-main class="main-content">
      <div class="content-wrapper">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" class="view-container" />
          </transition>
        </router-view>
      </div>
    </v-main>

    <AppSnackbar />
  </v-app>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAppStore } from './stores/app';
import AppNavigation from './components/layout/AppNavigation.vue';
import AppHeader from './components/layout/AppHeader.vue';
import AppSnackbar from './components/layout/AppSnackbar.vue';

const route = useRoute();
const appStore = useAppStore();

const isLoginPage = computed(() => route.name === 'Login');

onMounted(async () => {
  await Promise.all([appStore.fetchStatus(), appStore.fetchTools()]);
});
</script>

<style scoped>
.main-content {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.view-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
</style>

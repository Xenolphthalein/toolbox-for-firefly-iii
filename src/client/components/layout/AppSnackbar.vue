<template>
  <v-snackbar
    v-model="snackbarStore.visible"
    :color="snackbarStore.color"
    :timeout="snackbarStore.timeout"
    location="bottom right"
  >
    <div class="d-flex align-center">
      <v-icon class="mr-2">{{ snackbarStore.icon }}</v-icon>
      {{ snackbarStore.message }}
    </div>

    <template #actions>
      <v-btn variant="text" @click="snackbarStore.hide()"> Close </v-btn>
    </template>
  </v-snackbar>
</template>

<script setup lang="ts">
import { useSnackbarStore } from '../../stores/snackbar';

const snackbarStore = useSnackbarStore();
</script>

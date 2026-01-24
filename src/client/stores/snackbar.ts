import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type SnackbarType = 'success' | 'error' | 'info' | 'warning';

export interface SnackbarState {
  visible: boolean;
  message: string;
  type: SnackbarType;
  timeout: number;
}

export const useSnackbarStore = defineStore('snackbar', () => {
  // State
  const visible = ref(false);
  const message = ref('');
  const type = ref<SnackbarType>('info');
  const timeout = ref(5000);

  // Getters
  const color = computed(() => {
    switch (type.value) {
      case 'success':
        return 'success';
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  });

  const icon = computed(() => {
    switch (type.value) {
      case 'success':
        return 'mdi-check-circle';
      case 'error':
        return 'mdi-alert-circle';
      case 'warning':
        return 'mdi-alert';
      default:
        return 'mdi-information';
    }
  });

  // Actions
  function show(msg: string, msgType: SnackbarType = 'info', duration: number = 5000) {
    message.value = msg;
    type.value = msgType;
    timeout.value = duration;
    visible.value = true;
  }

  function hide() {
    visible.value = false;
  }

  return {
    // State
    visible,
    message,
    type,
    timeout,
    // Getters
    color,
    icon,
    // Actions
    show,
    hide,
  };
});

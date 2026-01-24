import { useSnackbarStore, type SnackbarType } from '../stores/snackbar';

/**
 * Composable for displaying snackbar notifications.
 * Provides a simple interface to show success, error, info, and warning messages.
 *
 * @example
 * ```ts
 * const { showSnackbar } = useSnackbar();
 * showSnackbar('Operation successful', 'success');
 * showSnackbar('Something went wrong', 'error');
 * ```
 */
export function useSnackbar() {
  const store = useSnackbarStore();

  /**
   * Show a snackbar notification
   * @param message - The message to display
   * @param type - The type of notification (success, error, info, warning)
   * @param duration - How long to show the snackbar in milliseconds (default: 5000)
   */
  function showSnackbar(message: string, type: SnackbarType = 'info', duration: number = 5000) {
    store.show(message, type, duration);
  }

  return {
    showSnackbar,
  };
}

export type { SnackbarType };

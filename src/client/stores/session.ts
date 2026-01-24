import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Session store for managing client-side session state.
 *
 * @deprecated This store is no longer used for backend communication.
 * Session identity is now managed server-side via Express session cookies.
 * The server uses req.session.id to key per-user state (caches, extenders).
 * This store is kept for backwards compatibility but may be removed in a future version.
 */
export const useSessionStore = defineStore('session', () => {
  // State - session ID (no longer sent to backend)
  const sessionId = ref(crypto.randomUUID());

  // Actions
  /**
   * Regenerate the session ID
   * @deprecated No longer affects backend state
   */
  function regenerateSessionId(): string {
    sessionId.value = crypto.randomUUID();
    return sessionId.value;
  }

  /**
   * Get the current session ID
   * @deprecated No longer affects backend state
   */
  function getSessionId(): string {
    return sessionId.value;
  }

  return {
    sessionId,
    regenerateSessionId,
    getSessionId,
  };
});

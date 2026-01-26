/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEFAULT_LOCALE?: string;
  // Vite's built-in env vars are inherited from vite/client
}

// Allow access to non-VITE_ prefixed env vars for production
declare const DEFAULT_LOCALE: string | undefined;

import { createI18n } from 'vue-i18n';
import type { Ref } from 'vue';
import en from '../locales/en.json';
import de from '../locales/de.json';

export type MessageSchema = typeof en;

export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const STORAGE_KEY = 'firefly-toolbox-settings';

/**
 * Get the initial locale based on priority:
 * 1. LocalStorage (user preference)
 * 2. Environment variable (DEFAULT_LOCALE)
 * 3. Browser language
 * 4. Fallback to 'en'
 */
function getInitialLocale(): SupportedLocale {
  // 1. Check localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.locale && SUPPORTED_LOCALES.includes(parsed.locale)) {
        return parsed.locale as SupportedLocale;
      }
    }
  } catch {
    // Ignore localStorage errors
  }

  // 2. Check environment variable (try generic first, fallback to VITE_ prefixed)
  const envLocale =
    typeof DEFAULT_LOCALE !== 'undefined' ? DEFAULT_LOCALE : import.meta.env.VITE_DEFAULT_LOCALE;
  if (envLocale && SUPPORTED_LOCALES.includes(envLocale as SupportedLocale)) {
    return envLocale as SupportedLocale;
  }

  // 3. Check browser language
  const browserLang = navigator.language.split('-')[0];
  if (SUPPORTED_LOCALES.includes(browserLang as SupportedLocale)) {
    return browserLang as SupportedLocale;
  }

  // 4. Fallback
  return 'en';
}

const i18n = createI18n<[MessageSchema], SupportedLocale>({
  legacy: false, // Use Composition API mode
  locale: getInitialLocale(),
  fallbackLocale: 'en',
  messages: {
    en,
    de,
  },
  missingWarn: false,
  fallbackWarn: false,
});

/**
 * Change the application locale
 */
export function setLocale(locale: SupportedLocale): void {
  if (SUPPORTED_LOCALES.includes(locale)) {
    (i18n.global.locale as unknown as Ref<SupportedLocale>).value = locale;
  }
}

/**
 * Get the current locale
 */
export function getLocale(): SupportedLocale {
  return (i18n.global.locale as unknown as Ref<SupportedLocale>).value;
}

export default i18n;

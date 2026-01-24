import 'vuetify/styles';
import { createVuetify, type VuetifyOptions } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import '@mdi/font/css/materialdesignicons.css';
import { themes, defaultThemeId, getVuetifyThemeName } from '../config/themes';

// Build Vuetify themes from our theme configuration
function buildVuetifyThemes(): Record<string, object> {
  const vuetifyThemes: Record<string, object> = {};

  for (const theme of themes) {
    vuetifyThemes[getVuetifyThemeName(theme.id, false)] = theme.light;
    vuetifyThemes[getVuetifyThemeName(theme.id, true)] = theme.dark;
  }

  return vuetifyThemes;
}

// Base Vuetify options
const options: VuetifyOptions = {
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
  theme: {
    defaultTheme: getVuetifyThemeName(defaultThemeId, true),
    themes: buildVuetifyThemes(),
  },
  defaults: {
    VCard: {
      elevation: 2,
    },
    VBtn: {
      variant: 'flat',
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
    },
    VTooltip: {
      contentClass: 'bg-surface text-on-surface',
    },
  },
};

// Factory function that allows injecting components/directives for dev mode
export function createVuetifyInstance(
  components?: Record<string, unknown>,
  directives?: Record<string, unknown>
) {
  return createVuetify({
    ...options,
    components,
    directives,
  });
}

// Default export for production (tree-shaken by vite-plugin-vuetify)
export default createVuetify(options);

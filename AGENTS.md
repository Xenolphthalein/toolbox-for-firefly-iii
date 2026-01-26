# AGENTS.md — FireflyIII Toolbox Development Guide

## Project Overview

FireflyIII Toolbox is a web application that extends FireflyIII (personal finance manager) with automation tools. It provides features like duplicate detection, AI-powered category/tag suggestions, subscription pattern detection, and Amazon/PayPal transaction matching.

---

## Tech Stack

### Frontend
- **Vue 3** with Composition API (`<script setup>`)
- **Vuetify 3** for UI components
- **TypeScript** for type safety
- **Vite** for build tooling

### Backend
- **Express.js** with TypeScript
- **Server-Sent Events (SSE)** for streaming progress updates
- **Session-based state** for multi-step operations (Amazon/PayPal uploads)

### Shared
- Common TypeScript types in `src/shared/types/`

---

## Project Structure

```
src/
├── client/                 # Vue frontend
│   ├── components/
│   │   ├── common/         # Reusable components (WizardStepper, DateRangeStep, etc.)
│   │   └── layout/         # App shell (AppNavigation, AppHeader)
│   ├── composables/        # Vue composables (useProgress, useStreamProcessor, etc.)
│   ├── views/              # Page components (*View.vue)
│   ├── stores/             # Pinia stores
│   ├── services/           # API client
│   └── utils/              # Formatting helpers
├── server/                 # Express backend
│   ├── routes/             # API route handlers
│   ├── services/           # Business logic
│   └── utils/              # Server utilities
└── shared/
    └── types/              # Shared TypeScript interfaces
```

---

## Key Patterns

### Tool Views (DuplicatesView, CategoriesView, etc.)
All tool views follow a consistent wizard pattern:
1. **Step 1**: Date range selection with transaction preview
2. **Step 2+**: Analysis/matching with streaming progress
3. **Results**: Summary card with selection and bulk actions

Use these shared components:
- `DateRangeStep` - Date picker + transaction preview
- `ResultsSummaryCard` - Stats chips + select all + action button
- `FinalActionButton` - Primary action that toggles to "Re-run" after first use
- `FileUploadCard` - File input with preview (Amazon/PayPal)
- `ProgressCard` - Progress bar during streaming operations

### Composables
- `useStreamProcessor` - SSE stream handling (replaces ~40 lines of boilerplate)
- `useProgress` - Progress state (current, total, message)
- `useSelection` - Multi-select with select all
- `useTransactionPreview` - Paginated transaction loading

### Streaming Pattern
Backend endpoints use SSE for long-running operations:
```typescript
// Server sends events like:
{ type: 'progress', data: { current: 5, total: 100, message: '...' } }
{ type: 'result', data: { /* result item */ } }
{ type: 'complete', data: null }
```

Frontend uses `useStreamProcessor`:
```typescript
const { processStream } = useStreamProcessor();
await processStream('/api/endpoint', body, handleStreamEvent);
```

---

## Conventions

### Vue Components
- Use `<script setup lang="ts">` syntax
- Props with `defineProps<T>()` and `withDefaults()`
- Emit with `defineEmits<T>()`
- All cards use `rounded="lg"`

### Styling
- Use Vuetify utility classes (`d-flex`, `align-center`, `ga-4`, `mb-4`, etc.)
- Scoped styles only when necessary
- No external CSS frameworks

### TypeScript
- Strict mode enabled
- Explicit types for props, emits, and function parameters
- Shared types in `@shared/types/app`

### Naming
- Components: `PascalCase.vue`
- Composables: `useCamelCase.ts`
- Views: `*View.vue`
- Routes: kebab-case (`/api/duplicates/stream-find`)

---

## Commands

```bash
npm run dev          # Start dev server (frontend + backend)
npm run build        # Production build
npm run typecheck    # TypeScript validation (run after changes)
npm run lint         # ESLint check
npm run format       # Prettier formatting
npm run i18n:check   # Check for duplicate translation keys
```

**Always run `npm run typecheck` and `npm run lint` after making changes.**

---

## Common Tasks

### Adding a New Tool View
1. Create `src/client/views/NewToolView.vue` following existing patterns
2. Add route in `src/client/router/index.ts`
3. Add navigation item in `AppNavigation.vue`
4. Create backend routes in `src/server/routes/`

### Creating a Reusable Component
1. Create in `src/client/components/common/`
2. Export from `src/client/components/common/index.ts`
3. Use `defineProps` with JSDoc comments for documentation

### Adding a Composable
1. Create in `src/client/composables/`
2. Export from `src/client/composables/index.ts`
3. Return reactive refs and functions

### Working with Internationalization (i18n)

The application uses **vue-i18n** for multi-language support. Currently supports English (`en`) and German (`de`).

**Using translations in components:**
```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <v-btn>{{ t('common.buttons.save') }}</v-btn>
  <h1>{{ t('duplicates.title') }}</h1>
</template>
```

**Translation file structure:**
- Files: `src/client/locales/en.json`, `src/client/locales/de.json`
- Organized by feature/section (e.g., `common`, `duplicates`, `categories`)
- Use dot notation: `section.subsection.key`

**Adding new translations:**
1. Add key to both `en.json` and `de.json` in the same location
2. Run `npm run i18n:check` to verify no duplicate keys exist
3. Use `t('your.translation.key')` in components

**Locale detection priority:**
1. User preference in localStorage (`firefly-toolbox-settings`)
2. Environment variable `DEFAULT_LOCALE` (or `VITE_DEFAULT_LOCALE` for backward compatibility)
3. Browser language
4. Fallback to English

**Changing locale programmatically:**
```typescript
import { setLocale, getLocale, SUPPORTED_LOCALES } from '@/plugins/i18n';

// Change language
setLocale('de');

// Get current language
const current = getLocale(); // 'en' | 'de'
```

**Adding a new language:**
1. Create `src/client/locales/{locale}.json` (copy from `en.json`)
2. Add locale to `SUPPORTED_LOCALES` in `src/client/plugins/i18n.ts`
3. Import and add to `messages` object in i18n plugin
4. Translate all keys in the new file

---

## Things to Watch Out For

1. **Don't start dev servers** - User runs `npm run dev` themselves
2. **Stream endpoints need session** - Amazon/PayPal use `{ includeSession: true }`
3. **Vuetify components are global** - No need to import `v-*` components
4. **Check existing patterns first** - The codebase has established abstractions
5. **Test with typecheck** - Vue SFC errors only surface with `vue-tsc`

---

## Static Assets

- `public/` - Static files served at root (e.g., `/logo.png`)
- `public/logo.png` - Application logo

---

## Environment

Configuration via environment variables (see `.env.example` for full details):

### Core Settings
- `FIREFLY_API_URL` - FireflyIII instance URL (required)
- `FIREFLY_API_TOKEN` - FireflyIII personal access token (required)
- `PORT` - Server port (default: `3000`)
- `APP_URL` - Public URL of this application for OAuth callbacks (default: `http://localhost:3000`)
- `NODE_ENV` - Environment: `development` or `production`
- `CORS_ORIGINS` - Allowed CORS origins, comma-separated

### Authentication
- `AUTH_METHODS` - Comma-separated list of enabled auth methods: `basic`, `oidc`, `firefly`, `none` (e.g., `AUTH_METHODS=basic,firefly`). If not set, auto-detects all configured methods.
- `AUTH_SESSION_SECRET` - Session secret for cookie signing (required in production)
- `AUTH_ALLOW_INSECURE` - Set to `true` to allow running without auth in production (not recommended)
- `AUTH_BASIC_USERNAME` / `AUTH_BASIC_PASSWORD` - Basic auth credentials
- `AUTH_OIDC_ISSUER_URL` / `AUTH_OIDC_CLIENT_ID` / `AUTH_OIDC_CLIENT_SECRET` / `AUTH_OIDC_SCOPES` - OIDC settings
- `AUTH_FIREFLY_CLIENT_ID` / `AUTH_FIREFLY_CLIENT_SECRET` - FireflyIII OAuth settings

### AI Settings
- `AI_PROVIDER` - AI provider: `openai` or `ollama` (auto-detects)
- `AI_MODEL` - Override model for any provider
- `OPENAI_API_KEY` - OpenAI API key
- `OPENAI_API_URL` - OpenAI API URL (default: `https://api.openai.com/v1`)
- `OPENAI_MODEL` - OpenAI model (default: `gpt-4o-mini`)
- `OLLAMA_API_URL` - Ollama API URL (default: `http://localhost:11434`)
- `OLLAMA_MODEL` - Ollama model (default: `llama3.2`)

### Logging
- `LOG_LEVEL` - Logging verbosity: `error`, `warn`, `info`, `debug` (default: `info`)
- `NO_COLOR` - Disable colored log output (set to `true` or `1`)
- `LOG_COLOR` - Force colored log output even when not in a TTY

### Other
- `FINTS_PRODUCT_ID` - FinTS product registration ID for German bank imports
- `DEFAULT_LOCALE` - Default language locale (`en` or `de`). Can also use `VITE_DEFAULT_LOCALE` for backward compatibility
- `NUMBER_FORMAT_LOCALE` / `NUMBER_FORMAT_DECIMAL` / `NUMBER_FORMAT_THOUSANDS` - Number parsing settings

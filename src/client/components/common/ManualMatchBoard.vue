<template>
  <div class="manual-match-board">
    <div class="manual-match-grid">
      <v-card rounded="lg" class="manual-match-column">
        <v-card-title class="manual-match-header">
          <div class="manual-match-header-title">
            <span class="text-overline text-medium-emphasis">1</span>
            <span class="text-subtitle-2">{{ sourceTitle }}</span>
          </div>
          <v-text-field
            v-model="sourceSearch"
            density="compact"
            variant="solo-filled"
            flat
            hide-details
            clearable
            class="manual-match-header-search"
            prepend-inner-icon="mdi-text-search"
            :placeholder="searchPlaceholder"
          />
          <v-chip size="small" color="primary" variant="tonal">
            {{ formatCount(filteredSourceItems.length, sourceItems.length, sourceSearch) }}
          </v-chip>
        </v-card-title>
        <v-divider />
        <v-card-text class="manual-match-column-body">
          <EmptyState
            v-if="sourceItems.length === 0"
            icon="mdi-check-circle-outline"
            :title="sourceEmptyTitle"
            :subtitle="sourceEmptySubtitle"
          />
          <EmptyState
            v-else-if="filteredSourceItems.length === 0"
            icon="mdi-magnify"
            :title="noSearchResultsTitle"
            :subtitle="noSearchResultsSubtitle"
          />
          <div v-else class="manual-match-scroll d-flex flex-column ga-3">
            <v-card
              v-for="item in filteredSourceItems"
              :key="item.id"
              rounded="lg"
              variant="outlined"
              class="manual-match-item"
              :class="{ 'manual-match-item--selected': selectedSourceId === item.id }"
              role="button"
              tabindex="0"
              :aria-selected="selectedSourceId === item.id"
              :aria-label="item.title"
              @click="$emit('select-source', item.id)"
              @keydown.enter.prevent="$emit('select-source', item.id)"
              @keydown.space.prevent="$emit('select-source', item.id)"
            >
              <v-card-text class="manual-match-item-body">
                <div class="d-flex justify-space-between align-start ga-3">
                  <div class="manual-match-item-copy">
                    <div v-if="item.overline" class="text-overline text-medium-emphasis">
                      {{ item.overline }}
                    </div>
                    <div class="text-subtitle-2">{{ item.title }}</div>
                    <div v-if="item.subtitle" class="text-body-2 text-medium-emphasis">
                      {{ item.subtitle }}
                    </div>
                  </div>
                  <div v-if="item.amount" class="text-body-2 font-weight-medium text-right">
                    {{ item.amount }}
                  </div>
                </div>

                <div v-if="item.chips?.length" class="d-flex flex-wrap ga-2 mt-3">
                  <v-chip
                    v-for="chip in item.chips"
                    :key="chip.label"
                    size="x-small"
                    :color="chip.color"
                    :variant="chip.variant || 'tonal'"
                  >
                    <v-icon v-if="chip.icon" start size="x-small">{{ chip.icon }}</v-icon>
                    {{ chip.label }}
                  </v-chip>
                </div>

                <div v-if="item.lines?.length" class="mt-3 d-flex flex-column ga-1">
                  <div
                    v-for="line in item.lines"
                    :key="line"
                    class="text-body-2 text-medium-emphasis manual-match-line"
                  >
                    {{ line }}
                  </div>
                </div>
              </v-card-text>
            </v-card>
          </div>
        </v-card-text>
      </v-card>

      <v-card rounded="lg" class="manual-match-column">
        <v-card-title class="manual-match-header">
          <div class="manual-match-header-title">
            <span class="text-overline text-medium-emphasis">2</span>
            <span class="text-subtitle-2">{{ transactionTitle }}</span>
          </div>
          <v-text-field
            v-model="transactionSearch"
            density="compact"
            variant="solo-filled"
            flat
            hide-details
            clearable
            class="manual-match-header-search"
            prepend-inner-icon="mdi-text-search"
            :placeholder="searchPlaceholder"
          />
          <v-chip size="small" color="primary" variant="tonal">
            {{
              formatCount(
                filteredTransactionItems.length,
                transactionItems.length,
                transactionSearch
              )
            }}
          </v-chip>
        </v-card-title>
        <v-divider />
        <v-card-text class="manual-match-column-body">
          <EmptyState
            v-if="transactionItems.length === 0"
            icon="mdi-check-circle-outline"
            :title="transactionEmptyTitle"
            :subtitle="transactionEmptySubtitle"
          />
          <EmptyState
            v-else-if="filteredTransactionItems.length === 0"
            icon="mdi-magnify"
            :title="noSearchResultsTitle"
            :subtitle="noSearchResultsSubtitle"
          />
          <div v-else class="manual-match-scroll d-flex flex-column ga-3">
            <v-card
              v-for="item in filteredTransactionItems"
              :key="item.id"
              rounded="lg"
              variant="outlined"
              class="manual-match-item"
              :class="{ 'manual-match-item--selected': selectedTransactionId === item.id }"
              role="button"
              tabindex="0"
              :aria-selected="selectedTransactionId === item.id"
              :aria-label="item.title"
              @click="$emit('select-transaction', item.id)"
              @keydown.enter.prevent="$emit('select-transaction', item.id)"
              @keydown.space.prevent="$emit('select-transaction', item.id)"
            >
              <v-card-text class="manual-match-item-body">
                <div class="d-flex justify-space-between align-start ga-3">
                  <div class="manual-match-item-copy">
                    <div v-if="item.overline" class="text-overline text-medium-emphasis">
                      {{ item.overline }}
                    </div>
                    <div class="text-subtitle-2">{{ item.title }}</div>
                    <div v-if="item.subtitle" class="text-body-2 text-medium-emphasis">
                      {{ item.subtitle }}
                    </div>
                  </div>
                  <div v-if="item.amount" class="text-body-2 font-weight-medium text-right">
                    {{ item.amount }}
                  </div>
                </div>

                <div v-if="item.chips?.length" class="d-flex flex-wrap ga-2 mt-3">
                  <v-chip
                    v-for="chip in item.chips"
                    :key="chip.label"
                    size="x-small"
                    :color="chip.color"
                    :variant="chip.variant || 'tonal'"
                  >
                    <v-icon v-if="chip.icon" start size="x-small">{{ chip.icon }}</v-icon>
                    {{ chip.label }}
                  </v-chip>
                </div>

                <div v-if="item.lines?.length" class="mt-3 d-flex flex-column ga-1">
                  <div
                    v-for="line in item.lines"
                    :key="line"
                    class="text-body-2 text-medium-emphasis manual-match-line"
                  >
                    {{ line }}
                  </div>
                </div>
              </v-card-text>
            </v-card>
          </div>
        </v-card-text>
      </v-card>

      <v-card rounded="lg" class="manual-match-action-card">
        <v-card-title class="manual-match-header">
          <div class="manual-match-header-title">
            <span class="text-overline text-medium-emphasis">3</span>
            <span class="text-subtitle-2">{{ createButtonText }}</span>
          </div>
        </v-card-title>
        <v-divider />
        <v-card-text class="manual-match-action-body">
          <div class="manual-match-selection">
            <div class="manual-match-selection-card">
              <div class="text-body-2 font-weight-medium">
                {{ selectedSourceItem?.title || sourceTitle }}
              </div>
              <div
                v-if="selectedSourceItem?.subtitle"
                class="text-body-2 text-medium-emphasis mt-1"
              >
                {{ selectedSourceItem.subtitle }}
              </div>
            </div>

            <div class="manual-match-action-icon">
              <v-icon size="28">mdi-link-variant</v-icon>
            </div>

            <div class="manual-match-selection-card">
              <div class="text-body-2 font-weight-medium">
                {{ selectedTransactionItem?.title || transactionTitle }}
              </div>
              <div
                v-if="selectedTransactionItem?.subtitle"
                class="text-body-2 text-medium-emphasis mt-1"
              >
                {{ selectedTransactionItem.subtitle }}
              </div>
            </div>
          </div>

          <div class="manual-match-action-button-wrap">
            <v-btn
              class="manual-match-action-button"
              color="primary"
              prepend-icon="mdi-arrow-left-right"
              :disabled="createDisabled"
              @click="$emit('create-match')"
            >
              {{ createButtonText }}
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <v-card rounded="lg" class="manual-match-assignments-card">
      <v-card-title
        class="manual-match-assignments-title d-flex align-center justify-space-between"
      >
        <span>{{ assignmentsTitle }}</span>
        <v-chip size="small" color="info" variant="tonal">
          {{ assignments.length }}
        </v-chip>
      </v-card-title>
      <v-divider />
      <v-card-text class="manual-match-assignments-body">
        <EmptyState
          v-if="assignments.length === 0"
          icon="mdi-link-off"
          :title="assignmentsEmptyTitle"
        />
        <div v-else class="manual-match-assignments-scroll d-flex flex-column ga-3">
          <v-card
            v-for="assignment in assignments"
            :key="assignment.id"
            rounded="lg"
            variant="outlined"
          >
            <v-card-text class="d-flex justify-space-between align-center flex-wrap ga-3">
              <div class="manual-match-assignment-copy">
                <div class="text-body-2 font-weight-medium">{{ assignment.sourceTitle }}</div>
                <div v-if="assignment.sourceSubtitle" class="text-body-2 text-medium-emphasis">
                  {{ assignment.sourceSubtitle }}
                </div>
                <div class="text-body-2 text-medium-emphasis my-1">→</div>
                <div class="text-body-2 font-weight-medium">{{ assignment.transactionTitle }}</div>
                <div v-if="assignment.transactionSubtitle" class="text-body-2 text-medium-emphasis">
                  {{ assignment.transactionSubtitle }}
                </div>
              </div>

              <v-btn
                color="error"
                variant="text"
                size="small"
                prepend-icon="mdi-link-off"
                @click="$emit('remove-match', assignment.id)"
              >
                {{ removeButtonText }}
              </v-btn>
            </v-card-text>
          </v-card>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import EmptyState from './EmptyState.vue';

export interface ManualMatchBoardItemChip {
  label: string;
  color?: string;
  icon?: string;
  variant?: 'tonal' | 'outlined' | 'flat' | 'text' | 'plain' | 'elevated';
}

export interface ManualMatchBoardItem {
  id: string;
  title: string;
  subtitle?: string;
  overline?: string;
  amount?: string;
  chips?: ManualMatchBoardItemChip[];
  lines?: string[];
}

export interface ManualMatchBoardAssignment {
  id: string;
  sourceTitle: string;
  sourceSubtitle?: string;
  transactionTitle: string;
  transactionSubtitle?: string;
}

const { t } = useI18n();

const props = defineProps<{
  createButtonText: string;
  createDisabled: boolean;
  sourceTitle: string;
  sourceEmptyTitle: string;
  sourceEmptySubtitle?: string;
  sourceItems: ManualMatchBoardItem[];
  selectedSourceId: string | null;
  transactionTitle: string;
  transactionEmptyTitle: string;
  transactionEmptySubtitle?: string;
  transactionItems: ManualMatchBoardItem[];
  selectedTransactionId: string | null;
  assignmentsTitle: string;
  assignmentsEmptyTitle: string;
  assignments: ManualMatchBoardAssignment[];
  removeButtonText: string;
}>();

defineEmits<{
  'select-source': [id: string];
  'select-transaction': [id: string];
  'create-match': [];
  'remove-match': [id: string];
}>();

const sourceSearch = ref('');
const transactionSearch = ref('');

const searchPlaceholder = computed(() => t('common.labels.search'));
const noSearchResultsTitle = computed(() => t('common.messages.noSearchResults'));
const noSearchResultsSubtitle = computed(() => t('common.messages.tryDifferentSearch'));

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function itemMatchesSearch(item: ManualMatchBoardItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    item.title,
    item.subtitle,
    item.overline,
    item.amount,
    ...(item.lines ?? []),
    ...(item.chips?.map((chip) => chip.label) ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  return haystack.includes(query);
}

const filteredSourceItems = computed(() => {
  const query = normalize(sourceSearch.value);
  return props.sourceItems.filter((item) => itemMatchesSearch(item, query));
});

const filteredTransactionItems = computed(() => {
  const query = normalize(transactionSearch.value);
  return props.transactionItems.filter((item) => itemMatchesSearch(item, query));
});

const selectedSourceItem = computed(
  () => props.sourceItems.find((item) => item.id === props.selectedSourceId) ?? null
);
const selectedTransactionItem = computed(
  () => props.transactionItems.find((item) => item.id === props.selectedTransactionId) ?? null
);

function formatCount(filtered: number, total: number, query: string): string {
  return normalize(query) ? `${filtered}/${total}` : String(total);
}
</script>

<style scoped>
.manual-match-board {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.manual-match-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(320px, 1.05fr);
}

.manual-match-column,
.manual-match-action-card,
.manual-match-assignments-card {
  min-height: 0;
}

.manual-match-column {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.manual-match-column-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.manual-match-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding-top: 10px;
  padding-bottom: 10px;
}

.manual-match-header-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 auto;
}

.manual-match-header-search {
  min-width: 0;
  flex: 1 1 160px;
  max-width: 260px;
}

.manual-match-header-search :deep(.v-field) {
  border-radius: 10px;
}

.manual-match-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.manual-match-item {
  cursor: pointer;
  flex: 0 0 auto;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.manual-match-item:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.manual-match-item--selected {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.06);
}

.manual-match-item-body {
  min-height: 88px;
  padding-top: 12px;
  padding-bottom: 12px;
}

.manual-match-item-copy,
.manual-match-assignment-copy {
  min-width: 0;
}

.manual-match-line {
  overflow-wrap: anywhere;
}

.manual-match-action-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.manual-match-action-body {
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 16px;
  overflow-y: auto;
}

.manual-match-action-button-wrap {
  margin-top: auto;
  flex: 0 0 auto;
}

.manual-match-action-button {
  width: 100%;
}

.manual-match-action-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

.manual-match-selection {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.manual-match-selection-card {
  width: 100%;
  border: 1px solid rgba(var(--v-border-color), 0.35);
  border-radius: 12px;
  padding: 12px;
  background: rgba(var(--v-theme-surface-variant), 0.18);
}

.manual-match-assignments-card {
  flex: 0 0 188px;
  min-height: 188px;
  max-height: 188px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.manual-match-assignments-title {
  min-height: 56px;
}

.manual-match-assignments-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-top: 12px;
  padding-bottom: 12px;
}

.manual-match-assignments-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

@media (max-width: 1260px) {
  .manual-match-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .manual-match-action-card {
    grid-column: 1 / -1;
  }
}

@media (max-width: 960px) {
  .manual-match-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

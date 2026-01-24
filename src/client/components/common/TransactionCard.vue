<template>
  <v-card
    rounded="lg"
    class="transaction-card"
    :class="{ selected }"
    :variant="variant"
    @click="$emit('click')"
  >
    <v-card-text class="py-3">
      <div class="d-flex align-center justify-space-between">
        <div class="d-flex align-center flex-grow-1 overflow-hidden">
          <v-checkbox
            v-if="selectable"
            :model-value="selected"
            hide-details
            density="compact"
            class="mr-2 flex-shrink-0"
            @update:model-value="$emit('update:selected', $event)"
            @click.stop
          />

          <v-avatar :color="typeColor" size="40" class="mr-3 flex-shrink-0">
            <v-icon color="white">{{ typeIcon }}</v-icon>
          </v-avatar>

          <div class="overflow-hidden flex-grow-1">
            <div class="text-subtitle-1 font-weight-medium truncate">
              {{ transaction.description }}
            </div>
            <div class="text-body-2 text-medium-emphasis d-flex flex-wrap ga-2">
              <span>{{ formattedDate }}</span>
              <span>•</span>
              <span class="truncate"
                >{{ transaction.source_name }} → {{ transaction.destination_name }}</span
              >
            </div>
          </div>
        </div>

        <div class="text-right ml-3 flex-shrink-0">
          <div class="text-h6 font-weight-bold amount" :class="amountClass">
            {{ formattedAmount }}
          </div>
          <div v-if="transaction.category_name" class="text-caption text-medium-emphasis">
            {{ transaction.category_name }}
          </div>
        </div>
      </div>

      <div v-if="transaction.tags && transaction.tags.length > 0" class="mt-2">
        <v-chip v-for="tag in transaction.tags" :key="tag" size="x-small" class="mr-1">
          {{ tag }}
        </v-chip>
      </div>

      <slot name="actions" />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FireflyTransactionSplit } from '@shared/types/firefly';

interface Props {
  transaction: FireflyTransactionSplit;
  selected?: boolean;
  selectable?: boolean;
  variant?: 'flat' | 'elevated' | 'tonal' | 'outlined' | 'text' | 'plain';
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  selectable: false,
  variant: 'elevated',
});

defineEmits<{
  click: [];
  'update:selected': [value: boolean | null];
}>();

const formattedDate = computed(() => {
  const date = new Date(props.transaction.date);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
});

const formattedAmount = computed(() => {
  const amount = parseFloat(props.transaction.amount);
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: props.transaction.currency_code || 'EUR',
  });
  return formatter.format(Math.abs(amount));
});

const typeColor = computed(() => {
  switch (props.transaction.type) {
    case 'withdrawal':
      return 'error';
    case 'deposit':
      return 'success';
    case 'transfer':
      return 'info';
    default:
      return 'grey';
  }
});

const typeIcon = computed(() => {
  switch (props.transaction.type) {
    case 'withdrawal':
      return 'mdi-arrow-up';
    case 'deposit':
      return 'mdi-arrow-down';
    case 'transfer':
      return 'mdi-swap-horizontal';
    default:
      return 'mdi-cash';
  }
});

const amountClass = computed(() => {
  if (props.transaction.type === 'deposit') {
    return 'positive';
  }
  if (props.transaction.type === 'withdrawal') {
    return 'negative';
  }
  return '';
});
</script>

<style scoped>
.transaction-card {
  transition: all 0.2s ease;
}

.transaction-card:hover {
  transform: translateY(-1px);
}

.transaction-card.selected {
  border: 2px solid rgb(var(--v-theme-primary));
}
</style>

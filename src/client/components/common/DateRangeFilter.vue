<template>
  <v-row align="center">
    <v-col cols="12" sm="6" md="3">
      <v-text-field
        v-model="localStartDate"
        label="Start Date"
        type="date"
        prepend-inner-icon="mdi-calendar"
        clearable
        variant="outlined"
        density="compact"
        hide-details
        @update:model-value="emitChange"
      />
    </v-col>
    <v-col cols="12" sm="6" md="3">
      <v-text-field
        v-model="localEndDate"
        label="End Date"
        type="date"
        prepend-inner-icon="mdi-calendar"
        clearable
        variant="outlined"
        density="compact"
        hide-details
        @update:model-value="emitChange"
      />
    </v-col>
    <v-col cols="12" md="6" class="d-flex flex-wrap ga-2 justify-end">
      <v-btn-group variant="outlined" density="comfortable">
        <v-btn v-for="preset in relativePresets" :key="preset" @click="setPreset(preset)">
          {{ presetLabels[preset] }}
        </v-btn>
      </v-btn-group>
      <v-btn-group variant="outlined" density="comfortable">
        <v-btn @click="setPreset('thisYear')">{{ currentYear }}</v-btn>
        <v-btn @click="setPreset('lastYear')">{{ currentYear - 1 }}</v-btn>
        <v-btn @click="setPreset('twoYearsAgo')">{{ currentYear - 2 }}</v-btn>
      </v-btn-group>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';

type RelativePreset = 'week' | 'month' | 'quarter' | 'year';
type YearPreset = 'thisYear' | 'lastYear' | 'twoYearsAgo';
type Preset = RelativePreset | YearPreset;

interface Props {
  startDate?: string;
  endDate?: string;
  presets?: RelativePreset[];
}

const props = withDefaults(defineProps<Props>(), {
  startDate: undefined,
  endDate: undefined,
  presets: () => ['week', 'month', 'quarter'],
});

const emit = defineEmits<{
  'update:startDate': [value: string | undefined];
  'update:endDate': [value: string | undefined];
  change: [{ startDate?: string; endDate?: string }];
}>();

const localStartDate = ref(props.startDate);
const localEndDate = ref(props.endDate);
const currentYear = new Date().getFullYear();

const relativePresets = computed(() => props.presets);

const presetLabels: Record<RelativePreset, string> = {
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
};

watch(
  () => props.startDate,
  (val) => (localStartDate.value = val)
);

watch(
  () => props.endDate,
  (val) => (localEndDate.value = val)
);

function emitChange() {
  emit('update:startDate', localStartDate.value || undefined);
  emit('update:endDate', localEndDate.value || undefined);
  emit('change', {
    startDate: localStartDate.value || undefined,
    endDate: localEndDate.value || undefined,
  });
}

function setPreset(preset: Preset) {
  const end = new Date();
  const start = new Date();

  switch (preset) {
    case 'week':
      start.setDate(end.getDate() - 7);
      break;
    case 'month':
      start.setMonth(end.getMonth() - 1);
      break;
    case 'quarter':
      start.setMonth(end.getMonth() - 3);
      break;
    case 'year':
      start.setFullYear(end.getFullYear() - 1);
      break;
    case 'thisYear':
      start.setFullYear(currentYear, 0, 1);
      end.setFullYear(currentYear, 11, 31);
      break;
    case 'lastYear':
      start.setFullYear(currentYear - 1, 0, 1);
      end.setFullYear(currentYear - 1, 11, 31);
      break;
    case 'twoYearsAgo':
      start.setFullYear(currentYear - 2, 0, 1);
      end.setFullYear(currentYear - 2, 11, 31);
      break;
  }

  localStartDate.value = start.toISOString().split('T')[0];
  localEndDate.value = end.toISOString().split('T')[0];
  emitChange();
}
</script>

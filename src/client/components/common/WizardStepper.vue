<template>
  <div class="wizard-stepper">
    <!-- Scrollable Step Content -->
    <div class="wizard-content">
      <slot :name="`content-${currentStep}`" />
    </div>

    <!-- Fixed Navigation at Bottom -->
    <div class="wizard-controls">
      <v-card rounded="lg">
        <v-card-text class="d-flex justify-space-between align-center py-4">
          <v-btn
            variant="text"
            color="error"
            prepend-icon="mdi-restart"
            :disabled="currentStep === 1 || disabled"
            @click="reset"
          >
            {{ t('common.buttons.startOver') }}
          </v-btn>

          <div class="d-flex align-center ga-3">
            <div class="d-flex align-center ga-2">
              <span class="text-body-2 text-medium-emphasis">
                {{
                  t('components.wizardStepper.stepXOfY', {
                    current: currentStep,
                    total: totalSteps,
                  })
                }}
              </span>
              <template v-if="statusMessage">
                <span class="text-medium-emphasis">•</span>
                <span class="text-body-2" :class="statusColor ? `text-${statusColor}` : ''">
                  {{ statusMessage }}
                </span>
              </template>
            </div>

            <div class="d-flex ga-2">
              <v-btn
                v-if="currentStep > 1"
                variant="outlined"
                prepend-icon="mdi-arrow-left"
                :disabled="disabled"
                @click="previousStep"
              >
                {{ t('common.buttons.back') }}
              </v-btn>

              <v-btn
                v-if="currentStep < totalSteps"
                color="primary"
                append-icon="mdi-arrow-right"
                :disabled="!canProceed || disabled"
                :loading="loading"
                @click="nextStep"
              >
                {{ nextButtonText || t('common.buttons.next') }}
              </v-btn>

              <slot name="final-action" />
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface StepItem {
  title: string;
  subtitle?: string;
}

interface Props {
  modelValue: number;
  steps: StepItem[];
  canProceed?: boolean;
  loading?: boolean;
  disabled?: boolean;
  nextButtonText?: string;
  statusMessage?: string;
  statusColor?: 'success' | 'warning' | 'error' | 'info' | '';
}

const props = withDefaults(defineProps<Props>(), {
  canProceed: true,
  loading: false,
  disabled: false,
  nextButtonText: undefined,
  statusMessage: '',
  statusColor: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: number];
  next: [step: number];
  back: [step: number];
  reset: [];
}>();

const currentStep = computed({
  get: () => props.modelValue,
  set: (value: number) => emit('update:modelValue', value),
});

const totalSteps = computed(() => props.steps.length);

function nextStep() {
  if (currentStep.value < totalSteps.value && props.canProceed) {
    const newStep = currentStep.value + 1;
    currentStep.value = newStep;
    emit('next', newStep);
  }
}

function previousStep() {
  if (currentStep.value > 1) {
    const newStep = currentStep.value - 1;
    currentStep.value = newStep;
    emit('back', newStep);
  }
}

function reset() {
  currentStep.value = 1;
  emit('reset');
}
</script>

<style scoped>
.wizard-stepper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.wizard-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 16px;
}

.wizard-controls {
  flex-shrink: 0;
}
</style>

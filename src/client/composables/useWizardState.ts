import { ref, computed, type Ref, type ComputedRef } from 'vue';

export interface WizardStep {
  title: string;
  subtitle?: string;
}

export interface StepConfig {
  /** Whether the user can proceed from this step */
  canProceed: () => boolean;
  /** Whether this step is currently loading */
  isLoading?: () => boolean;
  /** Text for the next button */
  nextButtonText?: string;
  /** Status message to show */
  statusMessage?: () => string;
  /** Color for the status message */
  statusColor?: () => string;
  /** Callback when entering this step */
  onEnter?: () => void | Promise<void>;
}

export interface WizardState {
  /** Current step (1-indexed) */
  currentStep: Ref<number>;
  /** Step definitions */
  steps: WizardStep[];
  /** Whether user can proceed from current step */
  canProceed: ComputedRef<boolean>;
  /** Whether current step is loading */
  stepLoading: ComputedRef<boolean>;
  /** Next button text for current step */
  nextButtonText: ComputedRef<string>;
  /** Status message for current step */
  statusMessage: ComputedRef<string>;
  /** Status color for current step */
  statusColor: ComputedRef<string>;
  /** Go to next step */
  nextStep: () => void;
  /** Go to previous step */
  prevStep: () => void;
  /** Go to specific step */
  goToStep: (step: number) => void;
  /** Reset wizard and call optional callback */
  reset: (callback?: () => void) => void;
  /** Handle step navigation from WizardStepper */
  onStepNext: (step: number) => void;
  /** Whether on the last step */
  isLastStep: ComputedRef<boolean>;
  /** Whether on the first step */
  isFirstStep: ComputedRef<boolean>;
}

/**
 * Composable for managing wizard/stepper state
 * @param steps - Array of step definitions
 * @param stepConfigs - Configuration for each step (keyed by step number)
 */
export function useWizardState(
  steps: WizardStep[],
  stepConfigs: Record<number, StepConfig>
): WizardState {
  const currentStep = ref(1);

  const canProceed = computed(() => {
    const config = stepConfigs[currentStep.value];
    return config?.canProceed() ?? true;
  });

  const stepLoading = computed(() => {
    const config = stepConfigs[currentStep.value];
    return config?.isLoading?.() ?? false;
  });

  const nextButtonText = computed(() => {
    const config = stepConfigs[currentStep.value];
    return config?.nextButtonText ?? 'Next';
  });

  const statusMessage = computed(() => {
    const config = stepConfigs[currentStep.value];
    return config?.statusMessage?.() ?? '';
  });

  const statusColor = computed(() => {
    const config = stepConfigs[currentStep.value];
    return config?.statusColor?.() ?? '';
  });

  const isLastStep = computed(() => currentStep.value === steps.length);
  const isFirstStep = computed(() => currentStep.value === 1);

  function nextStep(): void {
    if (currentStep.value < steps.length) {
      currentStep.value++;
    }
  }

  function prevStep(): void {
    if (currentStep.value > 1) {
      currentStep.value--;
    }
  }

  function goToStep(step: number): void {
    if (step >= 1 && step <= steps.length) {
      currentStep.value = step;
    }
  }

  function reset(callback?: () => void): void {
    currentStep.value = 1;
    callback?.();
  }

  function onStepNext(step: number): void {
    const config = stepConfigs[step];
    config?.onEnter?.();
  }

  return {
    currentStep,
    steps,
    canProceed,
    stepLoading,
    nextButtonText,
    statusMessage,
    statusColor,
    nextStep,
    prevStep,
    goToStep,
    reset,
    onStepNext,
    isLastStep,
    isFirstStep,
  };
}

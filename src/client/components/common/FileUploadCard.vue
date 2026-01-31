<template>
  <v-card rounded="lg">
    <v-card-title class="d-flex align-center justify-space-between py-2">
      <div class="d-flex align-center">
        <v-icon class="mr-2">mdi-upload</v-icon>
        {{ title }}
      </div>
      <div class="d-flex align-center ga-2">
        <slot name="actions" />
      </div>
    </v-card-title>
    <v-card-text>
      <!-- Drop Zone -->
      <div
        ref="dropZoneRef"
        class="drop-zone"
        :class="{
          'drop-zone--active': isDragging,
          'drop-zone--has-file': hasFile,
          'drop-zone--loading': loading,
        }"
        @click="openFilePicker"
        @dragover.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
      >
        <input
          ref="fileInputRef"
          type="file"
          :accept="accept"
          :multiple="multiple"
          class="drop-zone__input"
          @change="onFileSelected"
        />

        <!-- Loading State -->
        <template v-if="loading">
          <v-progress-circular indeterminate color="primary" size="48" />
          <div class="text-body-2 text-medium-emphasis mt-3">
            {{ t('common.messages.processing') }}
          </div>
        </template>

        <!-- Has File State -->
        <template v-else-if="hasFile">
          <v-icon size="48" color="success">mdi-check-circle</v-icon>
          <div class="text-body-1 font-weight-medium mt-3">
            {{ fileName }}
          </div>
          <div class="text-body-2 text-medium-emphasis mt-1">
            {{ t('components.fileUpload.clickOrDragToReplace') }}
          </div>
        </template>

        <!-- Empty State -->
        <template v-else>
          <v-icon size="48" :color="isDragging ? 'primary' : 'grey'">
            {{ isDragging ? 'mdi-file-download' : fileIcon }}
          </v-icon>
          <div class="text-body-1 mt-3">
            <span class="text-primary font-weight-medium">{{
              t('components.fileUpload.clickToUpload')
            }}</span>
            <span class="text-medium-emphasis">
              {{ t('components.fileUpload.orDragAndDrop') }}</span
            >
          </div>
          <div class="text-body-2 text-medium-emphasis mt-1">
            {{ resolvedAcceptLabel }}
          </div>
        </template>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    /** Card title */
    title: string;
    /** Accepted file types */
    accept: string;
    /** Icon for empty state */
    fileIcon?: string;
    /** Currently selected file(s) */
    file?: File[];
    /** Whether upload is in progress */
    loading?: boolean;
    /** Allow multiple files */
    multiple?: boolean;
    /** Label showing accepted file types */
    acceptLabel?: string;
  }>(),
  {
    fileIcon: 'mdi-file-document',
    file: () => [],
    loading: false,
    multiple: false,
    acceptLabel: undefined,
  }
);

const emit = defineEmits<{
  'update:file': [value: File[]];
  upload: [value: File | File[] | null];
}>();

const resolvedAcceptLabel = computed(
  () => props.acceptLabel ?? t('components.fileUpload.selectFile')
);

const fileInputRef = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);

const hasFile = computed(() => props.file && props.file.length > 0);
const fileName = computed(() => {
  if (!props.file || props.file.length === 0) return '';
  if (props.file.length === 1) return props.file[0].name;
  return t('components.fileUpload.filesSelected', { count: props.file.length });
});

function openFilePicker() {
  if (!props.loading) {
    fileInputRef.value?.click();
  }
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    const files = Array.from(input.files);
    emit('update:file', files);
    emit('upload', props.multiple ? files : files[0]);
  }
}

function onDragOver() {
  if (!props.loading) {
    isDragging.value = true;
  }
}

function onDragLeave() {
  isDragging.value = false;
}

function onDrop(event: DragEvent) {
  isDragging.value = false;
  if (props.loading) return;

  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    const fileArray = Array.from(files);
    // Filter by accepted types if specified
    const accepted = props.accept
      ? fileArray.filter((f) => {
          const acceptedTypes = props.accept.split(',').map((t) => t.trim());
          return acceptedTypes.some((type) => {
            if (type.startsWith('.')) {
              return f.name.toLowerCase().endsWith(type.toLowerCase());
            }
            return f.type === type || f.type.startsWith(type.replace('*', ''));
          });
        })
      : fileArray;

    if (accepted.length > 0) {
      const result = props.multiple ? accepted : [accepted[0]];
      emit('update:file', result);
      emit('upload', props.multiple ? result : result[0]);
    }
  }
}
</script>

<style scoped>
.drop-zone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  padding: 24px;
  border: 2px dashed rgba(var(--v-border-color), 0.4);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: rgba(var(--v-theme-surface-variant), 0.3);
}

.drop-zone:hover {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.05);
}

.drop-zone--active {
  border-color: rgb(var(--v-theme-primary));
  border-style: solid;
  background: rgba(var(--v-theme-primary), 0.1);
}

.drop-zone--has-file {
  border-color: rgb(var(--v-theme-success));
  border-style: solid;
  background: rgba(var(--v-theme-success), 0.05);
}

.drop-zone--has-file:hover {
  background: rgba(var(--v-theme-success), 0.1);
}

.drop-zone--loading {
  cursor: wait;
  pointer-events: none;
}

.drop-zone__input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
</style>

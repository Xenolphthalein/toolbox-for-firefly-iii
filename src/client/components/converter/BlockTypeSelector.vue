<template>
  <v-menu>
    <template #activator="{ props: menuProps }">
      <v-btn v-bind="{ ...menuProps, ...$attrs }" variant="tonal" prepend-icon="mdi-plus">
        Add Block
      </v-btn>
    </template>
    <v-list density="compact" max-height="400">
      <v-list-item
        v-for="blockType in blockTypes"
        :key="blockType.type"
        @click="$emit('select', blockType.type)"
      >
        <template #prepend>
          <v-icon :color="blockType.color" size="small">{{ blockType.icon }}</v-icon>
        </template>
        <v-list-item-title>{{ blockType.label }}</v-list-item-title>
        <v-list-item-subtitle>{{ blockType.description }}</v-list-item-subtitle>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
import type { TransformBlockType, BlockTypeInfo } from '@shared/types/converter';
import { BLOCK_TYPES } from '@shared/types/converter';

defineOptions({
  inheritAttrs: false,
});

defineProps<{
  /** Filter to specific block types (optional) */
  filter?: TransformBlockType[];
}>();

defineEmits<{
  select: [type: TransformBlockType];
}>();

const blockTypes: BlockTypeInfo[] = BLOCK_TYPES;
</script>

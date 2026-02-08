<template>
  <div>
    <!-- Tab buttons - text-based, underline active -->
    <div class="mb-6 flex gap-0.5" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab"
        :class="[
          'border-b-2 px-2 py-1.5 text-sm transition-colors',
          activeTab === tab
            ? 'border-[var(--color-primary-600)] font-medium text-[var(--color-primary-600)] dark:border-[var(--color-accent-400)] dark:text-[var(--color-accent-400)]'
            : 'border-transparent text-[var(--color-surface-500)] hover:text-[var(--color-surface-700)] dark:text-dm-muted dark:hover:text-[#c9d1d9]',
        ]"
        role="tab"
        :aria-selected="activeTab === tab"
        :aria-controls="`panel-${tab}`"
        @click="activeTab = tab"
      >
        {{ tab }}
        <span v-if="counts && counts[tab]" class="ms-1 text-xs text-[var(--color-surface-400)] dark:text-dm-faint">
          ({{ counts[tab] }})
        </span>
      </button>
    </div>

    <!-- Tab panels -->
    <div v-for="tab in tabs" v-show="activeTab === tab" :id="`panel-${tab}`" :key="tab" role="tabpanel">
      <slot :name="tab" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  tabs: string[];
  defaultTab?: string;
  counts?: Record<string, number>;
}>();

const activeTab = ref(props.defaultTab || props.tabs[0]);
</script>

<template>
  <div>
    <!-- Tab buttons - text-based, underline active -->
    <div class="flex gap-0.5 mb-6" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab"
        @click="activeTab = tab"
        :class="[
          'px-2 py-1.5 text-sm transition-colors border-b-2',
          activeTab === tab
            ? 'font-medium text-[var(--color-primary-600)] dark:text-[var(--color-accent-400)] border-[var(--color-primary-600)] dark:border-[var(--color-accent-400)]'
            : 'text-[var(--color-surface-500)] dark:text-dm-muted border-transparent hover:text-[var(--color-surface-700)] dark:hover:text-[#c9d1d9]',
        ]"
        role="tab"
        :aria-selected="activeTab === tab"
        :aria-controls="`panel-${tab}`"
      >
        {{ tab }}
        <span
          v-if="counts && counts[tab]"
          class="ms-1 text-xs text-[var(--color-surface-400)] dark:text-dm-faint"
        >
          ({{ counts[tab] }})
        </span>
      </button>
    </div>

    <!-- Tab panels -->
    <div
      v-for="tab in tabs"
      :key="tab"
      v-show="activeTab === tab"
      :id="`panel-${tab}`"
      role="tabpanel"
    >
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

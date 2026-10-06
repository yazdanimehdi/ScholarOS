<script setup lang="ts">
import { computed, ref } from 'vue';
import AdminShell from './AdminShell.vue';
import MediaGrid from './MediaGrid.vue';
import type { AdminCtx } from './types';

defineProps<{ ctx: AdminCtx }>();
const TABS = [
  {
    id: 'content',
    label: 'Content images',
    note: 'Used by posts, people, projects and other entries. Optimized at build time.',
  },
  {
    id: 'site',
    label: 'Site images',
    note: 'Used by pages, settings and images inside post text. Served as-is from /images.',
  },
] as const;
const folder = ref<'content' | 'site'>('content');
const note = computed(() => TABS.find((t) => t.id === folder.value)!.note);
</script>

<template>
  <AdminShell :ctx="ctx" active="media" title="Media">
    <div role="tablist" aria-label="Image folders" class="adm-actions">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        role="tab"
        class="adm-btn"
        :class="{ 'adm-btn-primary': folder === t.id }"
        :aria-selected="folder === t.id"
        @click="folder = t.id"
      >
        {{ t.label }}
      </button>
    </div>
    <p class="adm-muted">{{ note }}</p>
    <MediaGrid :key="folder" :folder="folder" />
  </AdminShell>
</template>

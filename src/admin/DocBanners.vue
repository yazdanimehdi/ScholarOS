<script setup lang="ts">
defineProps<{ draft: boolean; conflict: boolean }>();
defineEmits<{ restore: []; discard: []; reload: [] }>();
const vFocus = { mounted: (el: HTMLElement) => el.focus() };
</script>

<template>
  <div v-if="conflict" class="adm-modal" role="dialog" aria-modal="true" aria-labelledby="adm-conflict-title">
    <div>
      <h2 id="adm-conflict-title" class="adm-h2">This file changed since you opened it</h2>
      <p>
        Someone, or an automated job, saved a newer version. Reload to get it. Your edits stay in this browser, and you
        can re-apply them after reloading.
      </p>
      <div class="adm-actions">
        <button v-focus type="button" class="adm-btn adm-btn-primary" @click="$emit('reload')">Reload</button>
      </div>
    </div>
  </div>
  <p v-if="draft" class="adm-banner" role="status">
    <span>You have unsaved edits from an earlier session.</span>
    <span class="adm-actions">
      <button type="button" class="adm-btn adm-btn-small" @click="$emit('restore')">Restore edits</button>
      <button type="button" class="adm-btn adm-btn-small" @click="$emit('discard')">Discard</button>
    </span>
  </p>
</template>

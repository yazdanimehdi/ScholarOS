<script setup lang="ts">
import { ref } from 'vue';
import MediaGrid from './MediaGrid.vue';

defineProps<{ modelValue?: string; folder: 'content' | 'site'; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>();
const open = ref(false);
const vFocus = { mounted: (el: HTMLElement) => el.focus() };

function pick(url: string) {
  emit('update:modelValue', url);
  open.value = false;
}
</script>

<template>
  <div class="adm-list-row">
    <input
      type="text"
      :value="modelValue ?? ''"
      :aria-label="`${label} path`"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value || undefined)"
    />
    <button type="button" class="adm-btn adm-btn-small" @click="open = true">Choose…</button>
  </div>
  <div
    v-if="open"
    class="adm-modal"
    role="dialog"
    aria-modal="true"
    :aria-label="`Choose ${label}`"
    @keydown.esc="open = false"
  >
    <div>
      <div class="adm-head">
        <h2 class="adm-h2">Choose an image</h2>
        <button v-focus type="button" class="adm-btn adm-btn-small" @click="open = false">Close</button>
      </div>
      <MediaGrid :folder="folder" pickable @pick="pick" />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ items: unknown[]; blank?: () => unknown; fixed?: boolean; addLabel?: string }>();
const emit = defineEmits<{ update: [items: unknown[]] }>();

function move(index: number, by: number) {
  const next = [...props.items];
  [next[index], next[index + by]] = [next[index + by], next[index]];
  emit('update', next);
}
</script>

<template>
  <div class="adm-list">
    <div v-for="(item, index) in items" :key="index" class="adm-list-row">
      <div><slot :item="item" :index="index" /></div>
      <button type="button" class="adm-btn adm-btn-small" :disabled="index === 0" aria-label="Move up" @click="move(index, -1)">↑</button>
      <button type="button" class="adm-btn adm-btn-small" :disabled="index === items.length - 1" aria-label="Move down" @click="move(index, 1)">↓</button>
      <button
        v-if="!fixed"
        type="button"
        class="adm-btn adm-btn-small adm-btn-danger"
        aria-label="Remove"
        @click="emit('update', items.filter((_, i) => i !== index))"
      >
        ✕
      </button>
    </div>
    <button v-if="!fixed && blank" type="button" class="adm-btn adm-btn-small adm-add" @click="emit('update', [...items, blank()])">
      + {{ addLabel ?? 'Add' }}
    </button>
  </div>
</template>

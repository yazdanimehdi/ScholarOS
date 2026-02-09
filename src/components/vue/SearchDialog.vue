<template>
  <div>
    <!-- Trigger button -->
    <button
      class="hidden items-center gap-2 rounded-lg border border-surface-200 bg-surface-100 px-3 py-1.5 text-sm text-surface-700 transition-colors hover:border-surface-300 sm:inline-flex dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400 dark:hover:border-surface-600"
      aria-label="Search"
      @click="openDialog"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <span>Search...</span>
      <kbd
        class="hidden items-center gap-0.5 rounded bg-surface-200 px-1.5 py-0.5 font-mono text-xs text-surface-600 sm:inline-flex dark:bg-surface-700 dark:text-surface-300"
      >
        <span class="text-xs">&#8984;</span>K
      </kbd>
    </button>

    <!-- Dialog -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="isOpen"
          class="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm"
          @click.self="closeDialog"
          @keydown.escape="closeDialog"
        >
          <div
            class="w-full max-w-lg overflow-hidden rounded-xl border border-surface-200 bg-white shadow-2xl dark:border-surface-700 dark:bg-surface-900"
          >
            <!-- Search input -->
            <div class="flex items-center gap-3 border-b border-surface-200 px-4 dark:border-surface-700">
              <svg
                class="h-5 w-5 shrink-0 text-surface-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref="inputRef"
                v-model="query"
                type="text"
                placeholder="Search pages, people, publications..."
                class="flex-1 bg-transparent py-3 text-sm text-surface-900 placeholder-surface-400 outline-none dark:text-surface-100"
              />
              <kbd class="rounded bg-surface-100 px-1.5 py-0.5 font-mono text-xs text-surface-400 dark:bg-surface-800"
                >Esc</kbd
              >
            </div>

            <!-- Results -->
            <div class="max-h-80 overflow-y-auto p-2">
              <div v-if="!query" class="py-8 text-center text-sm text-surface-400 dark:text-surface-500">
                Start typing to search...
              </div>
              <div
                v-else-if="results.length === 0"
                class="py-8 text-center text-sm text-surface-400 dark:text-surface-500"
              >
                No results found for "{{ query }}"
              </div>
              <template v-else>
                <a
                  v-for="result in results"
                  :key="result.href"
                  :href="result.href"
                  class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-surface-100 dark:hover:bg-surface-800"
                  @click="closeDialog"
                >
                  <span
                    class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-xs font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400"
                  >
                    {{ result.type.charAt(0).toUpperCase() }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-medium text-surface-900 dark:text-surface-100">{{ result.title }}</div>
                    <div class="text-xs text-surface-500 capitalize dark:text-surface-400">{{ result.type }}</div>
                  </div>
                </a>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';

interface SearchItem {
  title: string;
  href: string;
  type: string;
  content?: string;
}

const props = defineProps<{
  items: SearchItem[];
}>();

const isOpen = ref(false);
const query = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

const results = computed(() => {
  if (!query.value) return [];
  const q = query.value.toLowerCase();
  return props.items
    .filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        (item.content && item.content.toLowerCase().includes(q)),
    )
    .slice(0, 10);
});

function openDialog() {
  isOpen.value = true;
  query.value = '';
  nextTick(() => inputRef.value?.focus());
}

function closeDialog() {
  isOpen.value = false;
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    if (isOpen.value) {
      closeDialog();
    } else {
      openDialog();
    }
  }
}

function handleOpenSearch() {
  openDialog();
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('open-search', handleOpenSearch);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('open-search', handleOpenSearch);
});
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

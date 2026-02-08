<template>
  <div>
    <!-- Trigger button -->
    <button
      @click="openDialog"
      class="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-sm text-surface-400 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg hover:border-surface-300 dark:hover:border-surface-600 transition-colors"
      aria-label="Search"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <span>Search...</span>
      <kbd class="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-mono bg-surface-200 dark:bg-surface-700 rounded">
        <span class="text-xs">&#8984;</span>K
      </kbd>
    </button>

    <!-- Dialog -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="isOpen"
          class="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
          @click.self="closeDialog"
          @keydown.escape="closeDialog"
        >
          <div class="w-full max-w-lg bg-white dark:bg-surface-900 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 overflow-hidden">
            <!-- Search input -->
            <div class="flex items-center gap-3 px-4 border-b border-surface-200 dark:border-surface-700">
              <svg class="w-5 h-5 text-surface-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref="inputRef"
                v-model="query"
                type="text"
                placeholder="Search pages, people, publications..."
                class="flex-1 py-3 text-sm bg-transparent text-surface-900 dark:text-surface-100 placeholder-surface-400 outline-none"
              />
              <kbd class="px-1.5 py-0.5 text-xs font-mono text-surface-400 bg-surface-100 dark:bg-surface-800 rounded">Esc</kbd>
            </div>

            <!-- Results -->
            <div class="max-h-80 overflow-y-auto p-2">
              <div v-if="!query" class="py-8 text-center text-sm text-surface-400 dark:text-surface-500">
                Start typing to search...
              </div>
              <div v-else-if="results.length === 0" class="py-8 text-center text-sm text-surface-400 dark:text-surface-500">
                No results found for "{{ query }}"
              </div>
              <template v-else>
                <a
                  v-for="result in results"
                  :key="result.href"
                  :href="result.href"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                  @click="closeDialog"
                >
                  <span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs font-medium shrink-0">
                    {{ result.type.charAt(0).toUpperCase() }}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-surface-900 dark:text-surface-100 truncate">{{ result.title }}</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400 capitalize">{{ result.type }}</div>
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
    .filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q) ||
      (item.content && item.content.toLowerCase().includes(q))
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
    isOpen.value ? closeDialog() : openDialog();
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

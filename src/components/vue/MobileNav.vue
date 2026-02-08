<template>
  <div>
    <!-- Hamburger button -->
    <button
      @click="open"
      class="inline-flex items-center justify-center w-8 h-8 rounded text-[var(--color-surface-500)] hover:text-[var(--color-surface-700)] dark:text-dm-muted dark:hover:text-[#c9d1d9] transition-colors"
      aria-label="Open menu"
    >
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>

    <!-- Backdrop -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="isOpen"
          class="fixed inset-0 z-50 bg-black/40"
          @click="close"
        />
      </Transition>

      <!-- Slide-out panel -->
      <Transition name="slide">
        <div
          v-if="isOpen"
          class="fixed top-0 bottom-0 z-50 w-64 bg-white dark:bg-dm-alt border-e border-[var(--color-surface-200)] dark:border-dm-border shadow-lg inset-inline-start-0"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          @keydown.escape="close"
        >
          <div class="flex items-center justify-between p-4 border-b border-[var(--color-surface-200)] dark:border-dm-border">
            <span class="text-sm font-medium text-[var(--color-surface-700)] dark:text-dm-text">Menu</span>
            <button
              ref="closeButtonRef"
              @click="close"
              class="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--color-surface-400)] hover:text-[var(--color-surface-600)] dark:text-dm-muted dark:hover:text-[#c9d1d9] transition-colors"
              aria-label="Close menu"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav class="p-3">
            <ul class="space-y-0.5">
              <li v-for="item in navItems" :key="item.href">
                <a
                  :href="item.href"
                  class="block px-3 py-2 text-sm rounded text-[var(--color-surface-600)] hover:text-[var(--color-primary-600)] hover:bg-[var(--color-surface-50)] dark:text-dm-muted dark:hover:text-[var(--color-accent-400)] dark:hover:bg-[#21262d] transition-colors"
                  @click="close"
                >
                  {{ item.label }}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';

interface NavItem {
  label: string;
  href: string;
}

defineProps<{
  navItems: NavItem[];
}>();

const isOpen = ref(false);
const closeButtonRef = ref<HTMLElement | null>(null);

function open() {
  isOpen.value = true;
  nextTick(() => {
    closeButtonRef.value?.focus();
  });
}

function close() {
  isOpen.value = false;
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}

:dir(rtl) .slide-enter-from,
:dir(rtl) .slide-leave-to {
  transform: translateX(100%);
}
</style>

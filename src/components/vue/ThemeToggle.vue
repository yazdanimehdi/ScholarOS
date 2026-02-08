<template>
  <button
    class="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--color-surface-500)] transition-colors hover:text-[var(--color-primary-600)] dark:text-dm-muted dark:hover:text-[var(--color-accent-400)]"
    :aria-label="`Switch to ${isDark ? 'light' : 'dark'} mode`"
    :title="`Switch to ${isDark ? 'light' : 'dark'} mode`"
    @click="toggle"
  >
    <!-- Sun icon (shown in dark mode) -->
    <svg v-if="isDark" class="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
    <!-- Moon icon (shown in light mode) -->
    <svg v-else class="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  </button>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const isDark = ref(false);

onMounted(() => {
  // Read from localStorage for consistency across ViewTransitions
  const saved = localStorage.getItem('theme');
  if (saved) {
    isDark.value = saved === 'dark';
  } else {
    isDark.value = document.documentElement.classList.contains('dark');
  }
});

function toggle() {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle('dark', isDark.value);
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
}
</script>

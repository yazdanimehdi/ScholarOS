<template>
  <form class="flex max-w-md flex-col gap-2 sm:flex-row" @submit.prevent="handleSubmit">
    <input
      v-model="email"
      type="email"
      required
      :disabled="isSubmitting"
      class="flex-1 rounded border border-[var(--color-surface-200)] bg-white px-3 py-2 text-sm text-[var(--color-surface-800)] placeholder-[var(--color-surface-400)] transition-colors outline-none focus:border-[var(--color-primary-500)] dark:border-dm-border-alt dark:bg-dm dark:text-dm-text dark:placeholder-dm-faint dark:focus:border-[var(--color-accent-500)]"
      placeholder="your.email@example.com"
    />
    <button
      type="submit"
      :disabled="isSubmitting"
      class="shrink-0 rounded bg-[var(--color-primary-600)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[var(--color-accent-700)]"
    >
      {{ isSubmitting ? 'Subscribing...' : 'Subscribe' }}
    </button>
  </form>

  <div
    v-if="status === 'success'"
    class="mt-2 max-w-md rounded border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-900/20"
  >
    <p class="text-sm text-green-700 dark:text-green-400">Thank you! You've been subscribed successfully.</p>
  </div>

  <div
    v-if="status === 'error'"
    class="mt-2 max-w-md rounded border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20"
  >
    <p class="text-sm text-red-700 dark:text-red-400">Something went wrong. Please try again.</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  accessKey: string;
}>();

const email = ref('');
const isSubmitting = ref(false);
const status = ref<'idle' | 'success' | 'error'>('idle');

async function handleSubmit() {
  isSubmitting.value = true;
  status.value = 'idle';

  try {
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: props.accessKey,
        email: email.value,
        subject: 'Newsletter Subscription',
        message: `New newsletter subscription from ${email.value}`,
      }),
    });

    if (response.ok) {
      status.value = 'success';
      email.value = '';
    } else {
      status.value = 'error';
    }
  } catch {
    status.value = 'error';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

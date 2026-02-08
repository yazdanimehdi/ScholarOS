<template>
  <form class="space-y-4" @submit.prevent="handleSubmit">
    <div>
      <label for="name" class="mb-1 block text-sm text-[var(--color-surface-600)] dark:text-dm-muted">Name</label>
      <input
        id="name"
        v-model="form.name"
        type="text"
        required
        class="w-full rounded border border-[var(--color-surface-200)] bg-white px-3 py-2 text-sm text-[var(--color-surface-800)] placeholder-[var(--color-surface-400)] transition-colors outline-none focus:border-[var(--color-primary-500)] dark:border-dm-border-alt dark:bg-dm dark:text-dm-text dark:placeholder-dm-faint dark:focus:border-[var(--color-accent-500)]"
        placeholder="Your name"
      />
    </div>

    <div>
      <label for="email" class="mb-1 block text-sm text-[var(--color-surface-600)] dark:text-dm-muted">Email</label>
      <input
        id="email"
        v-model="form.email"
        type="email"
        required
        class="w-full rounded border border-[var(--color-surface-200)] bg-white px-3 py-2 text-sm text-[var(--color-surface-800)] placeholder-[var(--color-surface-400)] transition-colors outline-none focus:border-[var(--color-primary-500)] dark:border-dm-border-alt dark:bg-dm dark:text-dm-text dark:placeholder-dm-faint dark:focus:border-[var(--color-accent-500)]"
        placeholder="your.email@example.com"
      />
    </div>

    <div>
      <label for="subject" class="mb-1 block text-sm text-[var(--color-surface-600)] dark:text-dm-muted">Subject</label>
      <input
        id="subject"
        v-model="form.subject"
        type="text"
        required
        class="w-full rounded border border-[var(--color-surface-200)] bg-white px-3 py-2 text-sm text-[var(--color-surface-800)] placeholder-[var(--color-surface-400)] transition-colors outline-none focus:border-[var(--color-primary-500)] dark:border-dm-border-alt dark:bg-dm dark:text-dm-text dark:placeholder-dm-faint dark:focus:border-[var(--color-accent-500)]"
        placeholder="What is this about?"
      />
    </div>

    <div>
      <label for="message" class="mb-1 block text-sm text-[var(--color-surface-600)] dark:text-dm-muted">Message</label>
      <textarea
        id="message"
        v-model="form.message"
        rows="5"
        required
        class="w-full resize-y rounded border border-[var(--color-surface-200)] bg-white px-3 py-2 text-sm text-[var(--color-surface-800)] placeholder-[var(--color-surface-400)] transition-colors outline-none focus:border-[var(--color-primary-500)] dark:border-dm-border-alt dark:bg-dm dark:text-dm-text dark:placeholder-dm-faint dark:focus:border-[var(--color-accent-500)]"
        placeholder="Your message..."
      />
    </div>

    <div>
      <button
        type="submit"
        :disabled="isSubmitting"
        class="inline-flex items-center gap-2 rounded bg-[var(--color-primary-600)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[var(--color-accent-700)]"
      >
        {{ isSubmitting ? 'Sending...' : 'Send Message' }}
      </button>
    </div>

    <div
      v-if="status === 'success'"
      class="rounded border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-900/20"
    >
      <p class="text-sm text-green-700 dark:text-green-400">Thank you! Your message has been sent successfully.</p>
    </div>

    <div
      v-if="status === 'error'"
      class="rounded border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20"
    >
      <p class="text-sm text-red-700 dark:text-red-400">Something went wrong. Please try again or email us directly.</p>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';

const props = defineProps<{
  accessKey: string;
}>();

const form = reactive({
  name: '',
  email: '',
  subject: '',
  message: '',
});

const isSubmitting = ref(false);
const status = ref<'idle' | 'success' | 'error'>('idle');

async function handleSubmit() {
  isSubmitting.value = true;
  status.value = 'idle';

  try {
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_key: props.accessKey, ...form }),
    });

    if (response.ok) {
      status.value = 'success';
      form.name = '';
      form.email = '';
      form.subject = '';
      form.message = '';
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

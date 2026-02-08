<template>
  <form @submit.prevent="handleSubmit" class="space-y-4">
    <div>
      <label for="name" class="block text-sm text-[var(--color-surface-600)] dark:text-dm-muted mb-1">Name</label>
      <input
        id="name"
        v-model="form.name"
        type="text"
        required
        class="w-full px-3 py-2 text-sm rounded border border-[var(--color-surface-200)] dark:border-dm-border-alt bg-white dark:bg-dm text-[var(--color-surface-800)] dark:text-dm-text placeholder-[var(--color-surface-400)] dark:placeholder-dm-faint outline-none focus:border-[var(--color-primary-500)] dark:focus:border-[var(--color-accent-500)] transition-colors"
        placeholder="Your name"
      />
    </div>

    <div>
      <label for="email" class="block text-sm text-[var(--color-surface-600)] dark:text-dm-muted mb-1">Email</label>
      <input
        id="email"
        v-model="form.email"
        type="email"
        required
        class="w-full px-3 py-2 text-sm rounded border border-[var(--color-surface-200)] dark:border-dm-border-alt bg-white dark:bg-dm text-[var(--color-surface-800)] dark:text-dm-text placeholder-[var(--color-surface-400)] dark:placeholder-dm-faint outline-none focus:border-[var(--color-primary-500)] dark:focus:border-[var(--color-accent-500)] transition-colors"
        placeholder="your.email@example.com"
      />
    </div>

    <div>
      <label for="subject" class="block text-sm text-[var(--color-surface-600)] dark:text-dm-muted mb-1">Subject</label>
      <input
        id="subject"
        v-model="form.subject"
        type="text"
        required
        class="w-full px-3 py-2 text-sm rounded border border-[var(--color-surface-200)] dark:border-dm-border-alt bg-white dark:bg-dm text-[var(--color-surface-800)] dark:text-dm-text placeholder-[var(--color-surface-400)] dark:placeholder-dm-faint outline-none focus:border-[var(--color-primary-500)] dark:focus:border-[var(--color-accent-500)] transition-colors"
        placeholder="What is this about?"
      />
    </div>

    <div>
      <label for="message" class="block text-sm text-[var(--color-surface-600)] dark:text-dm-muted mb-1">Message</label>
      <textarea
        id="message"
        v-model="form.message"
        rows="5"
        required
        class="w-full px-3 py-2 text-sm rounded border border-[var(--color-surface-200)] dark:border-dm-border-alt bg-white dark:bg-dm text-[var(--color-surface-800)] dark:text-dm-text placeholder-[var(--color-surface-400)] dark:placeholder-dm-faint outline-none focus:border-[var(--color-primary-500)] dark:focus:border-[var(--color-accent-500)] transition-colors resize-y"
        placeholder="Your message..."
      ></textarea>
    </div>

    <div>
      <button
        type="submit"
        :disabled="isSubmitting"
        class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded bg-[var(--color-primary-600)] dark:bg-[var(--color-accent-700)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {{ isSubmitting ? 'Sending...' : 'Send Message' }}
      </button>
    </div>

    <div v-if="status === 'success'" class="p-3 rounded border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20">
      <p class="text-sm text-green-700 dark:text-green-400">
        Thank you! Your message has been sent successfully.
      </p>
    </div>

    <div v-if="status === 'error'" class="p-3 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20">
      <p class="text-sm text-red-700 dark:text-red-400">
        Something went wrong. Please try again or email us directly.
      </p>
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

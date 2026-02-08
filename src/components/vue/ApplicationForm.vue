<template>
  <form class="space-y-4" @submit.prevent="handleSubmit">
    <div>
      <label for="app-name" class="mb-1 block text-sm text-[var(--color-surface-600)] dark:text-dm-muted"
        >Full Name <span class="text-red-500">*</span></label
      >
      <input
        id="app-name"
        v-model="form.name"
        type="text"
        required
        class="w-full rounded border border-[var(--color-surface-200)] bg-white px-3 py-2 text-sm text-[var(--color-surface-800)] placeholder-[var(--color-surface-400)] transition-colors outline-none focus:border-[var(--color-primary-500)] dark:border-dm-border-alt dark:bg-dm dark:text-dm-text dark:placeholder-dm-faint dark:focus:border-[var(--color-accent-500)]"
        placeholder="Your full name"
      />
    </div>

    <div>
      <label for="app-email" class="mb-1 block text-sm text-[var(--color-surface-600)] dark:text-dm-muted"
        >Email <span class="text-red-500">*</span></label
      >
      <input
        id="app-email"
        v-model="form.email"
        type="email"
        required
        class="w-full rounded border border-[var(--color-surface-200)] bg-white px-3 py-2 text-sm text-[var(--color-surface-800)] placeholder-[var(--color-surface-400)] transition-colors outline-none focus:border-[var(--color-primary-500)] dark:border-dm-border-alt dark:bg-dm dark:text-dm-text dark:placeholder-dm-faint dark:focus:border-[var(--color-accent-500)]"
        placeholder="your.email@example.com"
      />
    </div>

    <div>
      <label for="app-position" class="mb-1 block text-sm text-[var(--color-surface-600)] dark:text-dm-muted"
        >Position <span class="text-red-500">*</span></label
      >
      <input
        id="app-position"
        v-model="form.position"
        type="text"
        required
        readonly
        class="w-full cursor-default rounded border border-[var(--color-surface-200)] bg-[var(--color-surface-50)] px-3 py-2 text-sm text-[var(--color-surface-800)] outline-none dark:border-dm-border-alt dark:bg-dm-alt dark:text-dm-text"
      />
    </div>

    <div>
      <label for="app-affiliation" class="mb-1 block text-sm text-[var(--color-surface-600)] dark:text-dm-muted"
        >Current Affiliation</label
      >
      <input
        id="app-affiliation"
        v-model="form.affiliation"
        type="text"
        class="w-full rounded border border-[var(--color-surface-200)] bg-white px-3 py-2 text-sm text-[var(--color-surface-800)] placeholder-[var(--color-surface-400)] transition-colors outline-none focus:border-[var(--color-primary-500)] dark:border-dm-border-alt dark:bg-dm dark:text-dm-text dark:placeholder-dm-faint dark:focus:border-[var(--color-accent-500)]"
        placeholder="University or organization"
      />
    </div>

    <div>
      <label for="app-interests" class="mb-1 block text-sm text-[var(--color-surface-600)] dark:text-dm-muted"
        >Research Interests <span class="text-red-500">*</span></label
      >
      <textarea
        id="app-interests"
        v-model="form.researchInterests"
        rows="3"
        required
        class="w-full resize-y rounded border border-[var(--color-surface-200)] bg-white px-3 py-2 text-sm text-[var(--color-surface-800)] placeholder-[var(--color-surface-400)] transition-colors outline-none focus:border-[var(--color-primary-500)] dark:border-dm-border-alt dark:bg-dm dark:text-dm-text dark:placeholder-dm-faint dark:focus:border-[var(--color-accent-500)]"
        placeholder="Briefly describe your research interests and how they align with this position..."
      />
    </div>

    <div>
      <label for="app-message" class="mb-1 block text-sm text-[var(--color-surface-600)] dark:text-dm-muted"
        >Message / Cover Letter</label
      >
      <textarea
        id="app-message"
        v-model="form.message"
        rows="5"
        class="w-full resize-y rounded border border-[var(--color-surface-200)] bg-white px-3 py-2 text-sm text-[var(--color-surface-800)] placeholder-[var(--color-surface-400)] transition-colors outline-none focus:border-[var(--color-primary-500)] dark:border-dm-border-alt dark:bg-dm dark:text-dm-text dark:placeholder-dm-faint dark:focus:border-[var(--color-accent-500)]"
        placeholder="Any additional information you'd like to share..."
      />
    </div>

    <div>
      <label for="app-cv" class="mb-1 block text-sm text-[var(--color-surface-600)] dark:text-dm-muted"
        >CV/Resume Link</label
      >
      <input
        id="app-cv"
        v-model="form.cvLink"
        type="url"
        class="w-full rounded border border-[var(--color-surface-200)] bg-white px-3 py-2 text-sm text-[var(--color-surface-800)] placeholder-[var(--color-surface-400)] transition-colors outline-none focus:border-[var(--color-primary-500)] dark:border-dm-border-alt dark:bg-dm dark:text-dm-text dark:placeholder-dm-faint dark:focus:border-[var(--color-accent-500)]"
        placeholder="https://drive.google.com/..."
      />
    </div>

    <div>
      <button
        type="submit"
        :disabled="isSubmitting"
        class="inline-flex items-center gap-2 rounded bg-[var(--color-primary-600)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[var(--color-accent-700)]"
      >
        {{ isSubmitting ? 'Submitting...' : 'Submit Application' }}
      </button>
    </div>

    <div
      v-if="status === 'success'"
      class="rounded border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-900/20"
    >
      <p class="text-sm text-green-700 dark:text-green-400">
        Thank you! Your application has been submitted successfully. We will review it and get back to you.
      </p>
    </div>

    <div
      v-if="status === 'error'"
      class="rounded border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20"
    >
      <p class="text-sm text-red-700 dark:text-red-400">
        Something went wrong. Please try again or contact us directly at
        <a v-if="contactEmail" :href="'mailto:' + contactEmail" class="underline">{{ contactEmail }}</a
        >.
      </p>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';

const props = defineProps<{
  positionTitle: string;
  contactEmail?: string;
  accessKey: string;
}>();

const form = reactive({
  name: '',
  email: '',
  position: props.positionTitle,
  affiliation: '',
  researchInterests: '',
  message: '',
  cvLink: '',
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
      form.affiliation = '';
      form.researchInterests = '';
      form.message = '';
      form.cvLink = '';
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

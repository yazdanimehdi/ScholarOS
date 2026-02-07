<template>
  <form @submit.prevent="handleSubmit" class="space-y-4">
    <div>
      <label for="app-name" class="block text-sm text-[var(--color-surface-600)] dark:text-[#8b949e] mb-1">Full Name <span class="text-red-500">*</span></label>
      <input
        id="app-name"
        v-model="form.name"
        type="text"
        required
        class="w-full px-3 py-2 text-sm rounded border border-[var(--color-surface-200)] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[var(--color-surface-800)] dark:text-[#c9d1d9] placeholder-[var(--color-surface-400)] dark:placeholder-[#484f58] outline-none focus:border-[var(--color-primary-500)] dark:focus:border-[var(--color-accent-500)] transition-colors"
        placeholder="Your full name"
      />
    </div>

    <div>
      <label for="app-email" class="block text-sm text-[var(--color-surface-600)] dark:text-[#8b949e] mb-1">Email <span class="text-red-500">*</span></label>
      <input
        id="app-email"
        v-model="form.email"
        type="email"
        required
        class="w-full px-3 py-2 text-sm rounded border border-[var(--color-surface-200)] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[var(--color-surface-800)] dark:text-[#c9d1d9] placeholder-[var(--color-surface-400)] dark:placeholder-[#484f58] outline-none focus:border-[var(--color-primary-500)] dark:focus:border-[var(--color-accent-500)] transition-colors"
        placeholder="your.email@example.com"
      />
    </div>

    <div>
      <label for="app-position" class="block text-sm text-[var(--color-surface-600)] dark:text-[#8b949e] mb-1">Position <span class="text-red-500">*</span></label>
      <input
        id="app-position"
        v-model="form.position"
        type="text"
        required
        readonly
        class="w-full px-3 py-2 text-sm rounded border border-[var(--color-surface-200)] dark:border-[#30363d] bg-[var(--color-surface-50)] dark:bg-[#161b22] text-[var(--color-surface-800)] dark:text-[#c9d1d9] outline-none cursor-default"
      />
    </div>

    <div>
      <label for="app-affiliation" class="block text-sm text-[var(--color-surface-600)] dark:text-[#8b949e] mb-1">Current Affiliation</label>
      <input
        id="app-affiliation"
        v-model="form.affiliation"
        type="text"
        class="w-full px-3 py-2 text-sm rounded border border-[var(--color-surface-200)] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[var(--color-surface-800)] dark:text-[#c9d1d9] placeholder-[var(--color-surface-400)] dark:placeholder-[#484f58] outline-none focus:border-[var(--color-primary-500)] dark:focus:border-[var(--color-accent-500)] transition-colors"
        placeholder="University or organization"
      />
    </div>

    <div>
      <label for="app-interests" class="block text-sm text-[var(--color-surface-600)] dark:text-[#8b949e] mb-1">Research Interests <span class="text-red-500">*</span></label>
      <textarea
        id="app-interests"
        v-model="form.researchInterests"
        rows="3"
        required
        class="w-full px-3 py-2 text-sm rounded border border-[var(--color-surface-200)] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[var(--color-surface-800)] dark:text-[#c9d1d9] placeholder-[var(--color-surface-400)] dark:placeholder-[#484f58] outline-none focus:border-[var(--color-primary-500)] dark:focus:border-[var(--color-accent-500)] transition-colors resize-y"
        placeholder="Briefly describe your research interests and how they align with this position..."
      ></textarea>
    </div>

    <div>
      <label for="app-message" class="block text-sm text-[var(--color-surface-600)] dark:text-[#8b949e] mb-1">Message / Cover Letter</label>
      <textarea
        id="app-message"
        v-model="form.message"
        rows="5"
        class="w-full px-3 py-2 text-sm rounded border border-[var(--color-surface-200)] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[var(--color-surface-800)] dark:text-[#c9d1d9] placeholder-[var(--color-surface-400)] dark:placeholder-[#484f58] outline-none focus:border-[var(--color-primary-500)] dark:focus:border-[var(--color-accent-500)] transition-colors resize-y"
        placeholder="Any additional information you'd like to share..."
      ></textarea>
    </div>

    <div>
      <label for="app-cv" class="block text-sm text-[var(--color-surface-600)] dark:text-[#8b949e] mb-1">CV/Resume Link</label>
      <input
        id="app-cv"
        v-model="form.cvLink"
        type="url"
        class="w-full px-3 py-2 text-sm rounded border border-[var(--color-surface-200)] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[var(--color-surface-800)] dark:text-[#c9d1d9] placeholder-[var(--color-surface-400)] dark:placeholder-[#484f58] outline-none focus:border-[var(--color-primary-500)] dark:focus:border-[var(--color-accent-500)] transition-colors"
        placeholder="https://drive.google.com/..."
      />
    </div>

    <div>
      <button
        type="submit"
        :disabled="isSubmitting"
        class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded bg-[var(--color-primary-600)] dark:bg-[var(--color-accent-700)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {{ isSubmitting ? 'Submitting...' : 'Submit Application' }}
      </button>
    </div>

    <div v-if="status === 'success'" class="p-3 rounded border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20">
      <p class="text-sm text-green-700 dark:text-green-400">
        Thank you! Your application has been submitted successfully. We will review it and get back to you.
      </p>
    </div>

    <div v-if="status === 'error'" class="p-3 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20">
      <p class="text-sm text-red-700 dark:text-red-400">
        Something went wrong. Please try again or contact us directly at
        <a v-if="contactEmail" :href="'mailto:' + contactEmail" class="underline">{{ contactEmail }}</a>.
      </p>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';

const props = defineProps<{
  positionTitle: string;
  contactEmail?: string;
  formAction?: string;
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
    const action = props.formAction || 'https://formspree.io/f/YOUR_FORM_ID';
    const response = await fetch(action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(form),
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

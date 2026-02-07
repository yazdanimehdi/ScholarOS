<template>
  <div>
    <!-- Filter bar (al-folio style: Filter by: All | Journal | Conference | Year + search) -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6 pb-3 border-b border-[var(--color-surface-200)] dark:border-[#21262d]">
      <div class="flex items-center gap-1 text-sm">
        <span class="text-[var(--color-surface-400)] dark:text-[#484f58] me-1">Filter by:</span>
        <button
          @click="selectedType = ''"
          :class="[
            'px-2 py-0.5 text-sm transition-colors border-b-2',
            !selectedType
              ? 'font-medium text-[var(--color-primary-600)] dark:text-[var(--color-accent-400)] border-[var(--color-primary-600)] dark:border-[var(--color-accent-400)]'
              : 'text-[var(--color-surface-500)] dark:text-[#8b949e] border-transparent hover:text-[var(--color-surface-700)] dark:hover:text-[#c9d1d9]',
          ]"
        >
          All
        </button>
        <button
          v-for="t in types"
          :key="t"
          @click="selectedType = t"
          :class="[
            'px-2 py-0.5 text-sm capitalize transition-colors border-b-2',
            selectedType === t
              ? 'font-medium text-[var(--color-primary-600)] dark:text-[var(--color-accent-400)] border-[var(--color-primary-600)] dark:border-[var(--color-accent-400)]'
              : 'text-[var(--color-surface-500)] dark:text-[#8b949e] border-transparent hover:text-[var(--color-surface-700)] dark:hover:text-[#c9d1d9]',
          ]"
        >
          {{ t }}
        </button>
        <select
          v-model="selectedYear"
          class="ms-2 px-2 py-0.5 text-sm bg-transparent text-[var(--color-surface-500)] dark:text-[#8b949e] border-b-2 border-transparent cursor-pointer outline-none"
        >
          <option value="">Year</option>
          <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
        </select>
      </div>

      <!-- Search -->
      <div class="flex items-center gap-2">
        <div v-if="showSearch" class="relative">
          <input
            ref="searchInput"
            v-model="search"
            type="text"
            placeholder="Search..."
            class="w-48 ps-3 pe-8 py-1 text-sm rounded border border-[var(--color-surface-200)] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[var(--color-surface-800)] dark:text-[#c9d1d9] placeholder-[var(--color-surface-400)] dark:placeholder-[#484f58] outline-none focus:border-[var(--color-primary-500)] dark:focus:border-[var(--color-accent-500)]"
            @keydown.escape="showSearch = false; search = ''"
          />
          <button
            @click="showSearch = false; search = ''"
            class="absolute inset-inline-end-2 top-1/2 -translate-y-1/2 text-[var(--color-surface-400)] hover:text-[var(--color-surface-600)] dark:text-[#484f58] dark:hover:text-[#8b949e]"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <button
          @click="toggleSearch"
          class="text-[var(--color-surface-400)] hover:text-[var(--color-surface-600)] dark:text-[#484f58] dark:hover:text-[#8b949e] transition-colors"
          title="Search"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Results count -->
    <p v-if="search || selectedType || selectedYear" class="text-xs text-[var(--color-surface-400)] dark:text-[#484f58] mb-4">
      {{ filteredPublications.length }} of {{ publications.length }} publications
    </p>

    <!-- Publications list -->
    <div class="divide-y divide-[var(--color-surface-100)] dark:divide-[#21262d]">
      <div
        v-for="pub in filteredPublications"
        :key="pub.id"
        class="flex gap-3 py-3"
      >
        <!-- Venue badge -->
        <div class="shrink-0 pt-0.5">
          <span class="pub-badge">{{ getVenueAbbr(pub.venue) }}</span>
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <h3 class="text-[0.95rem] leading-snug font-medium text-[var(--color-surface-900)] dark:text-[#e6edf3]">
            <a
              v-if="pub.url"
              :href="pub.url"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-[var(--color-primary-600)] dark:hover:text-[var(--color-accent-400)] transition-colors"
            >
              {{ pub.title }}
            </a>
            <span v-else>{{ pub.title }}</span>
          </h3>

          <p class="mt-1 text-sm text-[var(--color-surface-500)] dark:text-[#8b949e]">
            <template v-for="(author, i) in pub.authors" :key="i">
              <span :class="{ 'font-medium text-[var(--color-surface-800)] dark:text-[#c9d1d9]': isHighlighted(author) }">
                {{ author }}
              </span>
              <span v-if="i < pub.authors.length - 1">, </span>
            </template>
          </p>

          <p class="mt-0.5 text-sm text-[var(--color-surface-500)] dark:text-[#8b949e]">
            {{ pub.venue }}, {{ pub.year }}
          </p>

          <div class="mt-2 flex flex-wrap gap-1.5">
            <a v-if="pub.url" :href="pub.url" target="_blank" rel="noopener noreferrer" class="action-btn">Paper</a>
            <a v-if="pub.doi" :href="`https://doi.org/${pub.doi}`" target="_blank" rel="noopener noreferrer" class="action-btn">DOI</a>
            <button
              v-if="pub.bibtex"
              @click="copyBibtex(pub)"
              class="action-btn"
            >
              {{ copiedId === pub.id ? 'Copied!' : 'BibTeX' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="filteredPublications.length === 0" class="text-center py-12 text-sm text-[var(--color-surface-400)] dark:text-[#484f58]">
      No publications match your filters.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';

interface Publication {
  id: string;
  title: string;
  authors: string[];
  venue: string;
  year: number;
  doi?: string;
  url?: string;
  bibtex?: string;
  type: string;
  featured?: boolean;
}

const props = defineProps<{
  publications: Publication[];
  highlightAuthors?: string[];
}>();

const search = ref('');
const selectedYear = ref('');
const selectedType = ref('');
const copiedId = ref<string | null>(null);
const showSearch = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);

const years = computed(() => {
  const y = [...new Set(props.publications.map(p => p.year))];
  return y.sort((a, b) => b - a);
});

const types = computed(() => {
  return [...new Set(props.publications.map(p => p.type))].sort();
});

const filteredPublications = computed(() => {
  return props.publications.filter(pub => {
    const matchesSearch = !search.value ||
      pub.title.toLowerCase().includes(search.value.toLowerCase()) ||
      pub.authors.some(a => a.toLowerCase().includes(search.value.toLowerCase())) ||
      pub.venue.toLowerCase().includes(search.value.toLowerCase());
    const matchesYear = !selectedYear.value || pub.year === Number(selectedYear.value);
    const matchesType = !selectedType.value || pub.type === selectedType.value;
    return matchesSearch && matchesYear && matchesType;
  });
});

function isHighlighted(author: string): boolean {
  return (props.highlightAuthors || []).some(h =>
    author.toLowerCase().includes(h.toLowerCase())
  );
}

function getVenueAbbr(venue: string): string {
  const parts = venue.split(' ');
  if (parts.length === 1) return venue;
  return parts[0].replace(/[^A-Za-z]/g, '');
}

function toggleSearch() {
  showSearch.value = !showSearch.value;
  if (showSearch.value) {
    nextTick(() => searchInput.value?.focus());
  } else {
    search.value = '';
  }
}

function copyBibtex(pub: Publication) {
  if (pub.bibtex) {
    navigator.clipboard.writeText(pub.bibtex).then(() => {
      copiedId.value = pub.id;
      setTimeout(() => { copiedId.value = null; }, 2000);
    });
  }
}
</script>

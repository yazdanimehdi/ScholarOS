<template>
  <div>
    <!-- Filter bar -->
    <div class="flex flex-col gap-3 mb-6 pb-3 border-b border-[var(--color-surface-200)] dark:border-dm-border">
      <!-- Row 1: Search bar (always visible) -->
      <div class="relative">
        <svg class="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-surface-400)] dark:text-dm-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="search"
          type="text"
          placeholder="Search publications..."
          class="w-full ps-9 pe-8 py-1.5 text-sm rounded-md border border-[var(--color-surface-200)] dark:border-dm-border-alt bg-white dark:bg-dm text-[var(--color-surface-800)] dark:text-dm-text placeholder-[var(--color-surface-400)] dark:placeholder-dm-faint outline-none focus:border-[var(--color-primary-500)] dark:focus:border-[var(--color-accent-500)]"
        />
        <button
          v-if="search"
          @click="search = ''"
          class="absolute end-2 top-1/2 -translate-y-1/2 text-[var(--color-surface-400)] hover:text-[var(--color-surface-600)] dark:text-dm-faint dark:hover:text-[#8b949e] text-lg leading-none"
        >
          &times;
        </button>
      </div>

      <!-- Row 2: Filter buttons + year + view toggle -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-1 text-sm">
          <span class="text-[var(--color-surface-400)] dark:text-dm-faint me-1">Filter by:</span>
          <button
            @click="selectedType = ''"
            :class="[
              'px-2 py-0.5 text-sm transition-colors border-b-2',
              !selectedType
                ? 'font-medium text-[var(--color-primary-600)] dark:text-[var(--color-accent-400)] border-[var(--color-primary-600)] dark:border-[var(--color-accent-400)]'
                : 'text-[var(--color-surface-500)] dark:text-dm-muted border-transparent hover:text-[var(--color-surface-700)] dark:hover:text-[#c9d1d9]',
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
                : 'text-[var(--color-surface-500)] dark:text-dm-muted border-transparent hover:text-[var(--color-surface-700)] dark:hover:text-[#c9d1d9]',
            ]"
          >
            {{ t }}
          </button>
          <select
            v-model="selectedYear"
            class="ms-2 px-2 py-0.5 text-sm bg-transparent text-[var(--color-surface-500)] dark:text-dm-muted border-b-2 border-transparent cursor-pointer outline-none"
          >
            <option value="">Year</option>
            <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
          </select>
        </div>

        <!-- View toggle -->
        <div class="flex items-center gap-1">
          <button
            @click="viewMode = 'list'"
            :class="[
              'p-1 rounded transition-colors',
              viewMode === 'list'
                ? 'text-[var(--color-primary-600)] dark:text-[var(--color-accent-400)]'
                : 'text-[var(--color-surface-400)] dark:text-dm-faint hover:text-[var(--color-surface-600)] dark:hover:text-[#8b949e]',
            ]"
            title="List view"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            @click="viewMode = 'grid'"
            :class="[
              'p-1 rounded transition-colors',
              viewMode === 'grid'
                ? 'text-[var(--color-primary-600)] dark:text-[var(--color-accent-400)]'
                : 'text-[var(--color-surface-400)] dark:text-dm-faint hover:text-[var(--color-surface-600)] dark:hover:text-[#8b949e]',
            ]"
            title="Grid view"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Results count -->
    <p v-if="search || selectedType || selectedYear" class="text-xs text-[var(--color-surface-400)] dark:text-dm-faint mb-4">
      {{ filteredPublications.length }} of {{ publications.length }} publications
    </p>

    <!-- List view -->
    <div v-if="viewMode === 'list'" class="divide-y divide-[var(--color-surface-100)] dark:divide-dm-border">
      <div
        v-for="pub in filteredPublications"
        :key="pub.id"
        class="flex gap-3 py-3"
      >
        <!-- Thumbnail (if image exists) -->
        <div v-if="pub.image" class="shrink-0 pt-0.5">
          <img :src="pub.image" :alt="pub.title" class="w-16 h-16 object-cover rounded border border-[var(--color-surface-200)] dark:border-dm-border-alt" loading="lazy" />
        </div>

        <!-- Venue badge (if no image) -->
        <div v-else class="shrink-0 pt-0.5">
          <span class="pub-badge">{{ getVenueAbbr(pub.venue) }}</span>
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <h3 class="text-[0.95rem] leading-snug font-medium text-[var(--color-surface-900)] dark:text-dm-heading">
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

          <p class="mt-1 text-sm text-[var(--color-surface-500)] dark:text-dm-muted">
            <template v-for="(author, i) in pub.authors" :key="i">
              <span :class="{ 'font-medium text-[var(--color-surface-800)] dark:text-dm-text': isHighlighted(author) }">
                {{ author }}
              </span>
              <span v-if="i < pub.authors.length - 1">, </span>
            </template>
          </p>

          <p class="mt-0.5 text-sm text-[var(--color-surface-500)] dark:text-dm-muted">
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

    <!-- Grid view -->
    <div v-if="viewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="pub in filteredPublications"
        :key="pub.id"
        class="rounded-lg border border-[var(--color-surface-200)] dark:border-dm-border-alt overflow-hidden bg-white dark:bg-dm-alt hover:border-[var(--color-primary-400)] dark:hover:border-[var(--color-accent-500)] transition-colors"
      >
        <!-- Card image or placeholder -->
        <div class="relative h-36 bg-[var(--color-surface-100)] dark:bg-dm">
          <img v-if="pub.image" :src="pub.image" :alt="pub.title" class="w-full h-full object-cover" loading="lazy" />
          <div v-else class="w-full h-full flex items-center justify-center">
            <span class="text-2xl font-bold text-[var(--color-surface-300)] dark:text-dm-border-alt">{{ getVenueAbbr(pub.venue) }}</span>
          </div>
          <span class="absolute top-2 end-2 px-1.5 py-0.5 text-xs font-medium rounded bg-black/60 text-white capitalize">{{ pub.type }}</span>
        </div>

        <!-- Card content -->
        <div class="p-3">
          <h3 class="text-sm leading-snug font-medium text-[var(--color-surface-900)] dark:text-dm-heading line-clamp-2">
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

          <p class="mt-1 text-xs text-[var(--color-surface-500)] dark:text-dm-muted truncate">
            {{ pub.authors.join(', ') }}
          </p>

          <p class="mt-0.5 text-xs text-[var(--color-surface-500)] dark:text-dm-muted">
            {{ pub.venue }}, {{ pub.year }}
          </p>

          <div class="mt-2 flex flex-wrap gap-1">
            <a v-if="pub.url" :href="pub.url" target="_blank" rel="noopener noreferrer" class="action-btn text-xs">Paper</a>
            <a v-if="pub.doi" :href="`https://doi.org/${pub.doi}`" target="_blank" rel="noopener noreferrer" class="action-btn text-xs">DOI</a>
            <button
              v-if="pub.bibtex"
              @click="copyBibtex(pub)"
              class="action-btn text-xs"
            >
              {{ copiedId === pub.id ? 'Copied!' : 'BibTeX' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="filteredPublications.length === 0" class="text-center py-12 text-sm text-[var(--color-surface-400)] dark:text-dm-faint">
      No publications match your filters.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

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
  abstract?: string;
  image?: string;
}

const props = defineProps<{
  publications: Publication[];
  highlightAuthors?: string[];
}>();

const search = ref('');
const selectedYear = ref('');
const selectedType = ref('');
const copiedId = ref<string | null>(null);
const viewMode = ref<'list' | 'grid'>('list');

const years = computed(() => {
  const y = [...new Set(props.publications.map(p => p.year))];
  return y.sort((a, b) => b - a);
});

const types = computed(() => {
  return [...new Set(props.publications.map(p => p.type))].sort();
});

const filteredPublications = computed(() => {
  return props.publications.filter(pub => {
    const q = search.value.toLowerCase();
    const matchesSearch = !search.value ||
      pub.title.toLowerCase().includes(q) ||
      pub.authors.some(a => a.toLowerCase().includes(q)) ||
      pub.venue.toLowerCase().includes(q) ||
      (pub.abstract && pub.abstract.toLowerCase().includes(q));
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

function copyBibtex(pub: Publication) {
  if (pub.bibtex) {
    navigator.clipboard.writeText(pub.bibtex).then(() => {
      copiedId.value = pub.id;
      setTimeout(() => { copiedId.value = null; }, 2000);
    });
  }
}
</script>

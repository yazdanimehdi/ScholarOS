<template>
  <div>
    <!-- Filter bar -->
    <div class="mb-6 flex flex-col gap-3 border-b border-[var(--color-surface-200)] pb-3 dark:border-dm-border">
      <!-- Row 1: Search bar (always visible) -->
      <div class="relative">
        <svg
          class="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-surface-400)] dark:text-dm-faint"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="search"
          type="text"
          placeholder="Search publications..."
          class="w-full rounded-md border border-[var(--color-surface-200)] bg-white py-1.5 ps-9 pe-8 text-sm text-[var(--color-surface-800)] placeholder-[var(--color-surface-400)] outline-none focus:border-[var(--color-primary-500)] dark:border-dm-border-alt dark:bg-dm dark:text-dm-text dark:placeholder-dm-faint dark:focus:border-[var(--color-accent-500)]"
        />
        <button
          v-if="search"
          class="absolute end-2 top-1/2 -translate-y-1/2 text-lg leading-none text-[var(--color-surface-400)] hover:text-[var(--color-surface-600)] dark:text-dm-faint dark:hover:text-[#8b949e]"
          @click="search = ''"
        >
          &times;
        </button>
      </div>

      <!-- Row 2: Filter buttons + year + view toggle -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-1 text-sm">
          <span class="me-1 text-[var(--color-surface-400)] dark:text-dm-faint">Filter by:</span>
          <button
            :class="[
              'border-b-2 px-2 py-0.5 text-sm transition-colors',
              !selectedType
                ? 'border-[var(--color-primary-600)] font-medium text-[var(--color-primary-600)] dark:border-[var(--color-accent-400)] dark:text-[var(--color-accent-400)]'
                : 'border-transparent text-[var(--color-surface-500)] hover:text-[var(--color-surface-700)] dark:text-dm-muted dark:hover:text-[#c9d1d9]',
            ]"
            @click="selectedType = ''"
          >
            All
          </button>
          <button
            v-for="t in types"
            :key="t"
            :class="[
              'border-b-2 px-2 py-0.5 text-sm capitalize transition-colors',
              selectedType === t
                ? 'border-[var(--color-primary-600)] font-medium text-[var(--color-primary-600)] dark:border-[var(--color-accent-400)] dark:text-[var(--color-accent-400)]'
                : 'border-transparent text-[var(--color-surface-500)] hover:text-[var(--color-surface-700)] dark:text-dm-muted dark:hover:text-[#c9d1d9]',
            ]"
            @click="selectedType = t"
          >
            {{ t }}
          </button>
          <select
            v-model="selectedYear"
            class="ms-2 cursor-pointer border-b-2 border-transparent bg-transparent px-2 py-0.5 text-sm text-[var(--color-surface-500)] outline-none dark:text-dm-muted"
          >
            <option value="">Year</option>
            <option v-for="year in years" :key="year" :value="year">
              {{ year }}
            </option>
          </select>
        </div>

        <!-- View toggle -->
        <div class="flex items-center gap-1">
          <button
            :class="[
              'rounded p-1 transition-colors',
              viewMode === 'list'
                ? 'text-[var(--color-primary-600)] dark:text-[var(--color-accent-400)]'
                : 'text-[var(--color-surface-400)] hover:text-[var(--color-surface-600)] dark:text-dm-faint dark:hover:text-[#8b949e]',
            ]"
            title="List view"
            @click="viewMode = 'list'"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            :class="[
              'rounded p-1 transition-colors',
              viewMode === 'grid'
                ? 'text-[var(--color-primary-600)] dark:text-[var(--color-accent-400)]'
                : 'text-[var(--color-surface-400)] hover:text-[var(--color-surface-600)] dark:text-dm-faint dark:hover:text-[#8b949e]',
            ]"
            title="Grid view"
            @click="viewMode = 'grid'"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path
                d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Results count -->
    <p
      v-if="search || selectedType || selectedYear"
      class="mb-4 text-xs text-[var(--color-surface-400)] dark:text-dm-faint"
    >
      {{ filteredPublications.length }} of {{ publications.length }} publications
    </p>

    <!-- List view -->
    <div v-if="viewMode === 'list'" class="divide-y divide-[var(--color-surface-100)] dark:divide-dm-border">
      <div v-for="pub in filteredPublications" :key="pub.id" class="flex gap-3 py-3">
        <!-- Thumbnail (if image exists) -->
        <div v-if="pub.image" class="shrink-0 pt-0.5">
          <img
            :src="pub.image"
            :alt="pub.title"
            class="h-16 w-16 rounded border border-[var(--color-surface-200)] object-cover dark:border-dm-border-alt"
            loading="lazy"
          />
        </div>

        <!-- Venue badge (if no image) -->
        <div v-else class="shrink-0 pt-0.5">
          <span class="pub-badge">{{ getVenueAbbr(pub.venue) }}</span>
        </div>

        <!-- Content -->
        <div class="min-w-0 flex-1">
          <h3 class="text-[0.95rem] leading-snug font-medium text-[var(--color-surface-900)] dark:text-dm-heading">
            <a
              v-if="pub.url"
              :href="pub.url"
              target="_blank"
              rel="noopener noreferrer"
              class="transition-colors hover:text-[var(--color-primary-600)] dark:hover:text-[var(--color-accent-400)]"
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
            <a
              v-if="pub.doi"
              :href="`https://doi.org/${pub.doi}`"
              target="_blank"
              rel="noopener noreferrer"
              class="action-btn"
              >DOI</a
            >
            <button v-if="pub.bibtex" class="action-btn" @click="copyBibtex(pub)">
              {{ copiedId === pub.id ? 'Copied!' : 'BibTeX' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Grid view -->
    <div v-if="viewMode === 'grid'" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="pub in filteredPublications"
        :key="pub.id"
        class="overflow-hidden rounded-lg border border-[var(--color-surface-200)] bg-white transition-colors hover:border-[var(--color-primary-400)] dark:border-dm-border-alt dark:bg-dm-alt dark:hover:border-[var(--color-accent-500)]"
      >
        <!-- Card image or placeholder -->
        <div class="relative h-36 bg-[var(--color-surface-100)] dark:bg-dm">
          <img v-if="pub.image" :src="pub.image" :alt="pub.title" class="h-full w-full object-cover" loading="lazy" />
          <div v-else class="flex h-full w-full items-center justify-center">
            <span class="text-2xl font-bold text-[var(--color-surface-300)] dark:text-dm-border-alt">{{
              getVenueAbbr(pub.venue)
            }}</span>
          </div>
          <span
            class="absolute end-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white capitalize"
            >{{ pub.type }}</span
          >
        </div>

        <!-- Card content -->
        <div class="p-3">
          <h3
            class="line-clamp-2 text-sm leading-snug font-medium text-[var(--color-surface-900)] dark:text-dm-heading"
          >
            <a
              v-if="pub.url"
              :href="pub.url"
              target="_blank"
              rel="noopener noreferrer"
              class="transition-colors hover:text-[var(--color-primary-600)] dark:hover:text-[var(--color-accent-400)]"
            >
              {{ pub.title }}
            </a>
            <span v-else>{{ pub.title }}</span>
          </h3>

          <p class="mt-1 truncate text-xs text-[var(--color-surface-500)] dark:text-dm-muted">
            {{ pub.authors.join(', ') }}
          </p>

          <p class="mt-0.5 text-xs text-[var(--color-surface-500)] dark:text-dm-muted">
            {{ pub.venue }}, {{ pub.year }}
          </p>

          <div class="mt-2 flex flex-wrap gap-1">
            <a v-if="pub.url" :href="pub.url" target="_blank" rel="noopener noreferrer" class="action-btn text-xs"
              >Paper</a
            >
            <a
              v-if="pub.doi"
              :href="`https://doi.org/${pub.doi}`"
              target="_blank"
              rel="noopener noreferrer"
              class="action-btn text-xs"
              >DOI</a
            >
            <button v-if="pub.bibtex" class="action-btn text-xs" @click="copyBibtex(pub)">
              {{ copiedId === pub.id ? 'Copied!' : 'BibTeX' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <p
      v-if="filteredPublications.length === 0"
      class="py-12 text-center text-sm text-[var(--color-surface-400)] dark:text-dm-faint"
    >
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
  const y = [...new Set(props.publications.map((p) => p.year))];
  return y.sort((a, b) => b - a);
});

const types = computed(() => {
  return [...new Set(props.publications.map((p) => p.type))].sort();
});

const filteredPublications = computed(() => {
  return props.publications.filter((pub) => {
    const q = search.value.toLowerCase();
    const matchesSearch =
      !search.value ||
      pub.title.toLowerCase().includes(q) ||
      pub.authors.some((a) => a.toLowerCase().includes(q)) ||
      pub.venue.toLowerCase().includes(q) ||
      (pub.abstract && pub.abstract.toLowerCase().includes(q));
    const matchesYear = !selectedYear.value || pub.year === Number(selectedYear.value);
    const matchesType = !selectedType.value || pub.type === selectedType.value;
    return matchesSearch && matchesYear && matchesType;
  });
});

function isHighlighted(author: string): boolean {
  return (props.highlightAuthors || []).some((h) => author.toLowerCase().includes(h.toLowerCase()));
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
      setTimeout(() => {
        copiedId.value = null;
      }, 2000);
    });
  }
}
</script>

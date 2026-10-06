<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- config files are user data */
import { computed, onMounted, ref } from 'vue';
import AdminShell from './AdminShell.vue';
import DocBanners from './DocBanners.vue';
import FormFields from './FormFields.vue';
import { api, report } from './api';
import { resolveOptions, text, type FieldDef, type Option } from './fields';
import { useDocument } from './useDocument';
import type { AdminCtx, CommitResult, Entry } from './types';

type Config = Record<string, any>;
defineProps<{ ctx: AdminCtx }>();

const HOME: FieldDef[] = [
  text('editorial.eyebrow', 'Eyebrow'),
  { key: 'editorial.tagline', label: 'Tagline', type: 'textarea' },
  { key: 'editorial.bio', label: 'Bio', type: 'markdown' },
  { key: 'editorial.figure.image', label: 'Figure image', type: 'image', folder: 'site' },
  text('editorial.figure.alt', 'Figure alt text'),
  text('editorial.figure.caption', 'Figure caption'),
  { key: 'editorial.affiliations', label: 'Affiliations', type: 'list' },
  text('editorial.contact.heading', 'Contact heading'),
  { key: 'editorial.contact.text', label: 'Contact text', type: 'textarea' },
  { key: 'about.enabled', label: 'Show the about section (classic theme)', type: 'checkbox', default: true },
  text('about.title', 'About title'),
  { key: 'about.text', label: 'About text', type: 'markdown' },
  { key: 'about.image', label: 'About image', type: 'image', folder: 'site' },
  {
    key: 'homepageSections',
    label: 'Home page sections',
    type: 'objects',
    fixed: true,
    fields: [
      { key: 'id', label: 'Section', type: 'readonly' },
      { key: 'enabled', label: 'Enabled', type: 'checkbox' },
    ],
  },
];

const RESEARCH: FieldDef[] = [
  { key: 'headline', label: 'Headline', type: 'textarea' },
  { key: 'description', label: 'Description', type: 'textarea' },
  {
    key: 'areas',
    label: 'Research areas',
    type: 'objects',
    fields: [
      text('title', 'Title'),
      text('label', 'Short label'),
      text('id', 'Anchor id (optional)'),
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'body', label: 'Body (Research page)', type: 'markdown' },
      { key: 'result', label: 'Key result', type: 'textarea' },
      { key: 'figure', label: 'Figure', type: 'image', folder: 'site' },
      text('caption', 'Figure caption'),
      { key: 'publications', label: 'Related publications', type: 'pubs', optionsFrom: 'publications' },
      { key: 'tags', label: 'Tags', type: 'list' },
    ],
  },
];

const tab = ref<'home' | 'research'>('home');
const home = useDocument<Config>();
const research = useDocument<Config>();
const publications = ref<Option[]>([]);
const researchFields = computed(() => resolveOptions(RESEARCH, { publications: publications.value }));

const loader = (file: string) => async () => {
  const { data, version } = await api<{ data: Config; version: string | null }>(`config/${file}`);
  return { value: data, version };
};
const publish = (doc: typeof home, file: string) =>
  doc.save(
    (data, version) => api<CommitResult>(`config/${file}`, { method: 'PUT', body: { data, version } }),
    `config/${file}.yml`,
  );

onMounted(() => {
  home.open('config/site#pages', loader('site'));
  research.open('config/research', loader('research'));
  api<Entry[]>('collections/publications').then((list) => {
    publications.value = list.map((p) => ({ value: p.slug, label: String(p.data.title ?? p.slug) }));
  }, report);
});
</script>

<template>
  <AdminShell :ctx="ctx" active="pages" title="Pages">
    <div role="tablist" aria-label="Pages" class="adm-actions">
      <button
        type="button"
        role="tab"
        class="adm-btn"
        :class="{ 'adm-btn-primary': tab === 'home' }"
        :aria-selected="tab === 'home'"
        @click="tab = 'home'"
      >
        Home
      </button>
      <button
        type="button"
        role="tab"
        class="adm-btn"
        :class="{ 'adm-btn-primary': tab === 'research' }"
        :aria-selected="tab === 'research'"
        @click="tab = 'research'"
      >
        Research
      </button>
    </div>

    <section v-show="tab === 'home'" class="adm-form" aria-label="Home page">
      <DocBanners
        :draft="!!home.draft"
        :conflict="home.conflict"
        @restore="home.restore()"
        @discard="home.discard()"
        @reload="home.reload()"
      />
      <p class="adm-muted">Saved to config/site.yml.</p>
      <FormFields v-if="home.current" :fields="HOME" :model="home.current" :errors="home.errors" />
      <div class="adm-actions">
        <button type="button" class="adm-btn adm-btn-primary" :disabled="home.saving" @click="publish(home, 'site')">
          Publish home page
        </button>
      </div>
    </section>

    <section v-show="tab === 'research'" class="adm-form" aria-label="Research page">
      <DocBanners
        :draft="!!research.draft"
        :conflict="research.conflict"
        @restore="research.restore()"
        @discard="research.discard()"
        @reload="research.reload()"
      />
      <p class="adm-muted">Saved to config/research.yml.</p>
      <FormFields
        v-if="research.current"
        :fields="researchFields"
        :model="research.current"
        :errors="research.errors"
      />
      <div class="adm-actions">
        <button
          type="button"
          class="adm-btn adm-btn-primary"
          :disabled="research.saving"
          @click="publish(research, 'research')"
        >
          Publish research page
        </button>
      </div>
    </section>
  </AdminShell>
</template>

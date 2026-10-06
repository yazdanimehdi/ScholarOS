<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- config files are user data */
import { onMounted } from 'vue';
import AdminShell from './AdminShell.vue';
import DocBanners from './DocBanners.vue';
import FormFields from './FormFields.vue';
import { api } from './api';
import { SOCIALS, select, text, type FieldDef } from './fields';
import { useDocument } from './useDocument';
import type { AdminCtx, CommitResult } from './types';

type Config = Record<string, any>;
defineProps<{ ctx: AdminCtx }>();

const GROUPS: { label: string; fields: FieldDef[] }[] = [
  {
    label: 'Identity',
    fields: [
      select('siteMode', 'Site mode', ['personal', 'lab']),
      text('title', 'Site title'),
      { key: 'description', label: 'Description', type: 'textarea' },
      text('author', 'Author (personal mode)'),
      text('labName', 'Lab name (lab mode)'),
      text('university', 'University'),
      text('department', 'Department'),
      text('siteUrl', 'Site URL'),
      text('lang', 'Language (BCP 47, e.g. en)'),
    ],
  },
  {
    label: 'Theme & colors',
    fields: [
      select('theme', 'Theme', ['classic', 'editorial']),
      select('defaultTheme', 'Light or dark by default (classic)', ['light', 'dark', 'system']),
      { key: 'colors.light.primary', label: 'Accent color', type: 'color' },
      { key: 'colors.dark.primary', label: 'Accent color in dark mode (classic)', type: 'color' },
    ],
  },
  {
    label: 'Fonts',
    fields: [
      text('fonts.families.sans', 'Sans-serif font'),
      text('fonts.families.serif', 'Serif font'),
      text('fonts.families.mono', 'Monospace font'),
    ],
  },
  {
    label: 'Navigation',
    fields: [
      { key: 'nav', label: 'Menu items', type: 'objects', fields: [text('label', 'Label'), text('href', 'Link')] },
    ],
  },
  {
    label: 'Socials',
    fields: [
      text('socials.email', 'Email'),
      ...SOCIALS.map((s) => text(`socials.${s}`, `${s[0].toUpperCase()}${s.slice(1)} URL`)),
    ],
  },
  {
    label: 'Top bar',
    fields: [
      { key: 'topBar.enabled', label: 'Show the top bar', type: 'checkbox' },
      text('topBar.text', 'Top bar text'),
    ],
  },
  {
    label: 'Hero',
    fields: [
      select('hero.type', 'Background', ['image', 'video', 'pattern', 'animation', 'none']),
      { key: 'hero.light.bgColor', label: 'Background color', type: 'color' },
      { key: 'hero.light.bgImage', label: 'Background image', type: 'image', folder: 'site' },
      { key: 'hero.dark.bgColor', label: 'Background color (dark mode)', type: 'color' },
      { key: 'hero.dark.bgImage', label: 'Background image (dark mode)', type: 'image', folder: 'site' },
    ],
  },
  {
    label: 'Admin users',
    fields: [
      {
        key: 'adminUsers',
        label: 'GitHub usernames',
        type: 'list',
        hint: 'Who can sign in here. Changes take effect after the redeploy this save triggers.',
      },
    ],
  },
];

const FEEDS: FieldDef[] = [
  {
    key: 'feeds',
    label: 'Feed sources',
    type: 'objects',
    fields: [
      text('name', 'Name'),
      text('url', 'Feed URL'),
      text('author', 'Author (people id)'),
      { key: 'tags', label: 'Tags', type: 'list' },
    ],
  },
  { key: 'maxItemsPerFeed', label: 'Items per feed', type: 'number' },
];

const site = useDocument<Config>();
const feeds = useDocument<Config>();
const loader = (file: string) => async () => {
  const { data, version } = await api<{ data: Config; version: string | null }>(`config/${file}`);
  return { value: data, version };
};
const publish = (doc: typeof site, file: string) =>
  doc.save(
    (data, version) => api<CommitResult>(`config/${file}`, { method: 'PUT', body: { data, version } }),
    `config/${file}.yml`,
  );

onMounted(() => {
  site.open('config/site#settings', loader('site'));
  feeds.open('config/feeds', loader('feeds'));
});
</script>

<template>
  <AdminShell :ctx="ctx" active="settings" title="Settings">
    <template #actions>
      <button
        type="button"
        class="adm-btn adm-btn-primary"
        :disabled="site.saving || !site.current"
        @click="publish(site, 'site')"
      >
        Publish settings
      </button>
    </template>
    <DocBanners
      :draft="!!site.draft"
      :conflict="site.conflict"
      :stale="site.draftStale ? site.draftChanges : null"
      @restore="site.restore()"
      @discard="site.discard()"
      @reload="site.reload()"
    />
    <template v-if="site.current">
      <fieldset v-for="group in GROUPS" :key="group.label" class="adm-group">
        <legend>{{ group.label }}</legend>
        <FormFields :fields="group.fields" :model="site.current" :errors="site.errors" />
      </fieldset>
    </template>

    <fieldset class="adm-group">
      <legend>Feeds</legend>
      <DocBanners
        :draft="!!feeds.draft"
        :conflict="feeds.conflict"
        :stale="feeds.draftStale ? feeds.draftChanges : null"
        @restore="feeds.restore()"
        @discard="feeds.discard()"
        @reload="feeds.reload()"
      />
      <p class="adm-muted">Saved to config/feeds.yml. The Medium feed is set on the Dashboard.</p>
      <FormFields v-if="feeds.current" :fields="FEEDS" :model="feeds.current" :errors="feeds.errors" />
      <div class="adm-actions">
        <button
          type="button"
          class="adm-btn"
          :disabled="feeds.saving || !feeds.current"
          @click="publish(feeds, 'feeds')"
        >
          Publish feeds
        </button>
      </div>
    </fieldset>
  </AdminShell>
</template>

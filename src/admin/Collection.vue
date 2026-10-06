<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- front matter is user data */
import { computed, onMounted, ref } from 'vue';
import AdminShell from './AdminShell.vue';
import DocBanners from './DocBanners.vue';
import FormFields from './FormFields.vue';
import MarkdownEditor from './MarkdownEditor.vue';
import { api, committed, report, toast } from './api';
import { COLLECTIONS, resolveOptions, type Option } from './fields';
import { useDocument } from './useDocument';
import type { AdminCtx, CommitResult, Entry } from './types';
import { normalizeAreas, type ResearchAreaInput } from '../lib/editorial';
import { slugify } from '../lib/utils';

type Doc = { data: Record<string, any>; body: string };

const props = defineProps<{ ctx: AdminCtx; name: string }>();
const cfg = COLLECTIONS[props.name];
const entries = ref<Entry[]>([]);
const selected = ref<string | null>(null);
const creating = ref(false);
const newSlug = ref('');
const readonly = ref(false);
const confirmDelete = ref(false);
const filters = ref<Record<string, string>>({});
const topics = ref<Option[]>([]);
const doc = useDocument<Doc>();

const path = (slug: string) => `src/content/${props.name}/${slug}.md`;
const fields = computed(() => resolveOptions(cfg.fields, { topics: topics.value }));
const title = (e: Entry) => String(e.data[cfg.titleKey] || e.slug);
const when = (e: Entry) => (cfg.dateKey ? String(e.data[cfg.dateKey] ?? '').slice(0, 10) : '');
const filterOptions = (key: string) =>
  [...new Set(entries.value.map((e) => String(e.data[key] ?? '')).filter(Boolean))].sort().reverse();
const visible = computed(() =>
  entries.value
    .filter((e) => Object.entries(filters.value).every(([k, v]) => !v || String(e.data[k] ?? '') === v))
    .sort((a, b) => when(b).localeCompare(when(a)) || title(a).localeCompare(title(b))),
);
const suggested = computed(() => slugify(String(doc.current?.data[cfg.titleKey] ?? '')));

onMounted(async () => {
  try {
    entries.value = await api<Entry[]>(`collections/${props.name}`);
  } catch (e) {
    report(e);
  }
  if (props.name === 'publications') {
    api<{ data: { areas?: ResearchAreaInput[] } }>('config/research').then(({ data }) => {
      topics.value = [
        ...normalizeAreas(data.areas).map((a) => ({ value: a.id, label: a.title })),
        { value: 'other', label: 'Other' },
      ];
    }, report);
  }
  const wanted = new URLSearchParams(location.search).get('slug');
  if (wanted) await select(wanted);
});

async function select(slug: string) {
  creating.value = false;
  confirmDelete.value = false;
  selected.value = slug;
  history.replaceState(null, '', `?slug=${slug}`);
  await doc.open(`${props.name}/${slug}`, loadEntry(slug));
}

const loadEntry = (slug: string) => async () => {
  const entry = await api<Doc & { version: string; readonly: boolean }>(`collections/${props.name}/${slug}`);
  readonly.value = entry.readonly;
  return { value: { data: entry.data, body: entry.body }, version: entry.version };
};

function startNew() {
  creating.value = true;
  selected.value = null;
  newSlug.value = '';
  readonly.value = false;
  history.replaceState(null, '', location.pathname);
  doc.open(`${props.name}/new`, async () => ({ value: { data: structuredClone(cfg.blank), body: '' }, version: null }));
}

async function save() {
  if (!doc.current) return;
  const slug = creating.value ? newSlug.value || suggested.value : selected.value!;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    toast('The slug needs 1–80 lowercase letters, digits or dashes');
    return;
  }
  const result = await doc.save(
    (v, version) =>
      api<CommitResult>(`collections/${props.name}/${slug}`, {
        method: 'PUT',
        body: { data: v.data, body: v.body, version },
      }),
    path(slug),
  );
  if (!result) return;
  const entry: Entry = { slug, data: { ...doc.current.data }, version: result.versions[path(slug)] ?? '' };
  entries.value = [...entries.value.filter((e) => e.slug !== slug), entry];
  if (creating.value) {
    creating.value = false;
    selected.value = slug;
    doc.retarget(`${props.name}/${slug}`, loadEntry(slug));
    history.replaceState(null, '', `?slug=${slug}`);
  }
}

async function remove() {
  if (!selected.value || !doc.version) return;
  if (!confirmDelete.value) {
    confirmDelete.value = true;
    return;
  }
  confirmDelete.value = false;
  try {
    committed(
      await api<CommitResult>(`collections/${props.name}/${selected.value}`, {
        method: 'DELETE',
        body: { version: doc.version },
      }),
    );
    entries.value = entries.value.filter((e) => e.slug !== selected.value);
    selected.value = null;
    doc.current = null;
    history.replaceState(null, '', location.pathname);
  } catch (e) {
    report(e);
  }
}
</script>

<template>
  <AdminShell :ctx="ctx" :active="name === 'publications' ? 'publications' : `content/${name}`" :title="cfg.label">
    <template #actions>
      <button type="button" class="adm-btn adm-btn-primary" @click="startNew">New {{ cfg.singular }}</button>
    </template>
    <div class="adm-split">
      <section aria-label="Entries" class="adm-form">
        <div v-if="cfg.filters" class="adm-actions">
          <label v-for="key in cfg.filters" :key="key" class="adm-field adm-grow">
            <span>{{ key[0].toUpperCase() + key.slice(1) }}</span>
            <select v-model="filters[key]">
              <option value="">All</option>
              <option v-for="o in filterOptions(key)" :key="o" :value="o">{{ o }}</option>
            </select>
          </label>
        </div>
        <ul class="adm-pick">
          <li v-for="e in visible" :key="e.slug">
            <button type="button" :aria-current="selected === e.slug" @click="select(e.slug)">
              <span>{{ title(e) }}</span
              ><span class="adm-muted">{{ when(e) }}</span>
            </button>
          </li>
        </ul>
        <p v-if="!visible.length" class="adm-muted">Nothing here yet.</p>
      </section>
      <section v-if="doc.current" aria-label="Editor" class="adm-form">
        <DocBanners
          :draft="!!doc.draft"
          :conflict="doc.conflict"
          @restore="doc.restore()"
          @discard="doc.discard()"
          @reload="doc.reload()"
        />
        <p v-if="readonly" class="adm-banner">This entry is MDX: read-only here, edit it in the repository.</p>
        <label v-if="creating" class="adm-field">
          <span>Slug (file name)</span>
          <input v-model="newSlug" type="text" :placeholder="suggested" />
        </label>
        <FormFields :fields="fields" :model="doc.current.data" :errors="doc.errors" :owner="ctx.siteName" />
        <div class="adm-field" role="group" aria-labelledby="adm-body-label">
          <span id="adm-body-label">Body</span>
          <MarkdownEditor v-model="doc.current.body" compact />
        </div>
        <div class="adm-actions">
          <button type="button" class="adm-btn adm-btn-primary" :disabled="doc.saving || readonly" @click="save">
            {{ creating ? 'Create' : 'Publish' }}
          </button>
          <button v-if="!creating" type="button" class="adm-btn adm-btn-danger" :disabled="readonly" @click="remove">
            {{ confirmDelete ? 'Click again to delete' : 'Delete' }}
          </button>
        </div>
      </section>
      <p v-else class="adm-muted">Choose an entry or create a new one.</p>
    </div>
  </AdminShell>
</template>

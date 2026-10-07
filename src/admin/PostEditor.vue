<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- front matter is user data */
import { computed, nextTick, onMounted, ref } from 'vue';
import AdminShell from './AdminShell.vue';
import DocBanners from './DocBanners.vue';
import FormFields from './FormFields.vue';
import MarkdownEditor from './MarkdownEditor.vue';
import { api, report, toast } from './api';
import { resolveOptions, setIn, type FieldDef, type Option } from './fields';
import { useDocument } from './useDocument';
import type { AdminCtx, CommitResult, Entry } from './types';
import { slugify } from '../lib/utils';

type Post = { data: Record<string, any>; body: string };

const props = defineProps<{ ctx: AdminCtx; slug: string }>();
const isNew = ref(props.slug === 'new');
const slug = ref(isNew.value ? '' : props.slug);
const preview = ref(false);
const publications = ref<Option[]>([]);
const doc = useDocument<Post>();

const SIDEBAR: FieldDef[] = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'tags', label: 'Tags', type: 'list' },
  { key: 'relatedPublication', label: 'Related publication', type: 'select', optionsFrom: 'publications' },
  { key: 'excerpt', label: 'Summary', type: 'textarea', hint: 'Shown in post lists and link previews.' },
  { key: 'featured', label: 'Show on home page', type: 'checkbox' },
];
const sidebar = computed(() => resolveOptions(SIDEBAR, { publications: publications.value }));
const suggested = computed(() => slugify(String(doc.current?.data.title ?? '')));

const loadPost = (target: string) => async () => {
  const entry = await api<Post & { version: string; readonly: boolean }>(`collections/posts/${target}`);
  return { value: { data: entry.data, body: entry.body }, version: entry.version, readonly: entry.readonly };
};

onMounted(async () => {
  await doc.open(
    `posts/${props.slug}`,
    isNew.value
      ? async () => ({
          value: { data: { title: '', date: new Date().toISOString().slice(0, 10), draft: true }, body: '' },
          version: null,
        })
      : loadPost(props.slug),
  );
  api<Entry[]>('collections/publications').then((list) => {
    publications.value = list.map((p) => ({ value: p.slug, label: String(p.data.title ?? p.slug) }));
  }, report);
});

async function save(draft: boolean) {
  if (!doc.current) return;
  const target = isNew.value ? slug.value || suggested.value : slug.value;
  if (!/^[a-z0-9-]{1,80}$/.test(target)) {
    toast('The slug needs 1–80 lowercase letters, digits or dashes');
    return;
  }
  const path = `src/content/posts/${target}.md`;
  const result = await doc.save(
    (post, version) =>
      api<CommitResult>(`collections/posts/${target}`, {
        method: 'PUT',
        body: { data: { ...post.data, draft }, body: post.body, version },
      }),
    path,
  );
  if (!result || !doc.current) return;
  doc.current.data.draft = draft; // only once saved: a failed save or a conflict leaves the flag as it was
  await nextTick();
  doc.discard(); // the flag change above is already committed, not an unsaved edit
  if (isNew.value) {
    isNew.value = false;
    slug.value = target;
    doc.retarget(`posts/${target}`, loadPost(target));
    history.replaceState(null, '', `/${props.ctx.adminPath}/posts/${target}`);
  }
}

function setSubtitle(e: Event) {
  if (doc.current) setIn(doc.current.data, 'subtitle', (e.target as HTMLInputElement).value);
}
</script>

<template>
  <AdminShell :ctx="ctx" active="posts" :title="isNew ? 'New post' : 'Edit post'">
    <template #actions>
      <button type="button" class="adm-btn" :aria-pressed="preview" @click="preview = !preview">
        {{ preview ? 'Edit' : 'Preview' }}
      </button>
      <button type="button" class="adm-btn" :disabled="doc.saving || doc.readonly" @click="save(true)">
        Save draft
      </button>
      <button type="button" class="adm-btn adm-btn-primary" :disabled="doc.saving || doc.readonly" @click="save(false)">
        Publish
      </button>
    </template>
    <template v-if="doc.current">
      <DocBanners
        :draft="!!doc.draft"
        :path="isNew ? undefined : `src/content/posts/${slug}.md`"
        :version="doc.version"
        :conflict="doc.conflict"
        :stale="doc.draftStale ? doc.draftChanges : null"
        @restore="doc.restore()"
        @discard="doc.discard()"
        @reload="doc.reload()"
      />
      <p v-if="doc.readonly" class="adm-banner">
        This post is MDX. The admin shows it read-only; edit it in the repository.
      </p>
      <div class="adm-split adm-split-wide">
        <div class="adm-form">
          <input
            v-model="doc.current.data.title"
            class="adm-title-input"
            type="text"
            placeholder="Title"
            aria-label="Title"
            :readonly="doc.readonly"
          />
          <span v-if="doc.errors.title" class="adm-err">{{ doc.errors.title }}</span>
          <input
            :value="doc.current.data.subtitle ?? ''"
            class="adm-subtitle-input"
            type="text"
            placeholder="Subtitle"
            aria-label="Subtitle"
            :readonly="doc.readonly"
            @input="setSubtitle"
          />
          <pre v-if="doc.readonly" class="adm-card adm-pre">{{ doc.current.body }}</pre>
          <MarkdownEditor v-else v-model="doc.current.body" :preview="preview" />
        </div>
        <aside class="adm-form" aria-label="Post settings">
          <label class="adm-field">
            <span>Slug (URL)</span>
            <input v-model="slug" type="text" :readonly="!isNew" :placeholder="suggested" />
            <small>/blog/{{ slug || suggested }}</small>
          </label>
          <fieldset class="adm-plain-fieldset" :disabled="doc.readonly">
            <FormFields :fields="sidebar" :model="doc.current.data" :errors="doc.errors" />
          </fieldset>
        </aside>
      </div>
    </template>
  </AdminShell>
</template>

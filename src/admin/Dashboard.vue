<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- feeds.yml is user data */
import { computed, onMounted, ref } from 'vue';
import AdminShell from './AdminShell.vue';
import { api, committed, report, toast } from './api';
import type { AdminCtx, CommitResult, Entry } from './types';
import type { JobName, JobsRecord } from '../lib/admin/jobs';
import type { FeedItem } from '../lib/types';
import { postStatus } from '../lib/utils';

interface DashboardData {
  posts: Entry[];
  feedItems: FeedItem[];
  feeds: { data: Record<string, any>; version: string | null };
  publications: number;
  cvUpdated: string | null;
  lastSync: string | null;
  feedsError?: string;
  mode: 'static' | 'git' | 'postgres';
  jobs: JobsRecord | null;
}
const JOB_LABELS: [JobName, string][] = [
  ['feeds', 'Feeds'],
  ['scheduled', 'Scheduled posts'],
  ['backup', 'Backup to git'],
];
const running = ref(false);

async function runNow() {
  if (!d.value) return;
  running.value = true;
  try {
    d.value.jobs = await api<JobsRecord>('jobs/run', { method: 'POST' });
    const failed = JOB_LABELS.filter(([name]) => d.value?.jobs?.[name]?.ok === false).map(([, label]) => label);
    toast(failed.length ? `Jobs finished; failed: ${failed.join(', ')}` : 'Jobs finished');
  } catch (e) {
    report(e);
  } finally {
    running.value = false;
  }
}

interface Row {
  key: string;
  title: string;
  date: string;
  source: string;
  status: string;
  slug?: string;
  id?: string;
}

const props = defineProps<{ ctx: AdminCtx }>();
const base = `/${props.ctx.adminPath}`;
const d = ref<DashboardData | null>(null);
const query = ref('');
const medium = ref('');
const syncing = ref(false);

const rows = computed<Row[]>(() => {
  if (!d.value) return [];
  const hidden = new Set<string>(d.value.feeds.data.hidden ?? []);
  const q = query.value.trim().toLowerCase();
  return [
    ...d.value.posts.map(
      (p): Row => ({
        key: `post:${p.slug}`,
        title: String(p.data.title ?? p.slug),
        date: String(p.data.date ?? '').slice(0, 10),
        source: 'This site',
        status: postStatus(p.data),
        slug: p.slug,
      }),
    ),
    ...d.value.feedItems.map(
      (f): Row => ({
        key: `feed:${f.id}`,
        title: f.title,
        date: f.date,
        source: f.source,
        status: hidden.has(f.id) ? 'Hidden' : 'Published',
        id: f.id,
      }),
    ),
  ]
    .filter((r) => !q || r.title.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
});

async function load() {
  try {
    d.value = await api<DashboardData>('dashboard');
    medium.value = String(d.value.feeds.data.mediumUrl ?? '');
  } catch (e) {
    report(e);
  }
}

async function setHidden(row: Row, hidden: boolean) {
  if (!d.value || !row.id) return;
  try {
    const result = await api<CommitResult>('feeds/hidden', { method: 'PUT', body: { id: row.id, hidden } });
    committed(result);
    const ids = new Set<string>(d.value.feeds.data.hidden ?? []);
    if (hidden) ids.add(row.id);
    else ids.delete(row.id);
    d.value.feeds = {
      data: { ...d.value.feeds.data, hidden: [...ids] },
      version: result.versions['config/feeds.yml'] ?? null,
    };
  } catch (e) {
    report(e);
  }
}

async function saveMedium() {
  if (!d.value) return;
  const data = { ...d.value.feeds.data, mediumUrl: medium.value.trim() };
  try {
    const result = await api<CommitResult>('config/feeds', {
      method: 'PUT',
      body: { data, version: d.value.feeds.version },
    });
    committed(result);
    d.value.feeds = { data, version: result.versions['config/feeds.yml'] ?? null };
  } catch (e) {
    report(e);
  }
}

async function checkNow() {
  syncing.value = true;
  try {
    const result = await api<{
      changed: boolean;
      count: number;
      failed: { source: string; error: string }[];
      url?: string;
    }>('feeds/sync', { method: 'POST' });
    if (result.changed) committed(result);
    else toast(`No new items (${result.count} in total)`);
    for (const f of result.failed) toast(`${f.source}: ${f.error}`);
    await load();
  } catch (e) {
    report(e);
  } finally {
    syncing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <AdminShell :ctx="ctx" active="" title="Dashboard">
    <template #actions>
      <a class="adm-btn" :href="`${base}/cv`">Edit CV</a>
      <a class="adm-btn adm-btn-primary" :href="`${base}/posts/new`">New post</a>
    </template>
    <p v-if="!d" class="adm-muted">Loading…</p>
    <template v-else>
      <div class="adm-tiles">
        <div class="adm-card adm-tile">
          <b>{{ d.posts.length }}</b
          ><span>Site posts</span>
        </div>
        <div class="adm-card adm-tile">
          <b>{{ d.feedItems.length }}</b
          ><span>Imported posts</span>
        </div>
        <div class="adm-card adm-tile">
          <b>{{ d.publications }}</b
          ><span>Publications</span>
        </div>
        <div class="adm-card adm-tile">
          <b>{{ d.cvUpdated ? new Date(d.cvUpdated).toLocaleDateString() : '—' }}</b
          ><span>CV last updated</span>
        </div>
        <div class="adm-card adm-tile">
          <b>{{ d.mode === 'postgres' ? 'Postgres' : 'Git' }}</b
          ><span>Content storage</span>
        </div>
      </div>
      <section v-if="d.mode === 'postgres'" class="adm-card adm-form" aria-labelledby="adm-jobs">
        <div class="adm-head">
          <h2 id="adm-jobs" class="adm-h2">Daily jobs</h2>
          <button type="button" class="adm-btn" :disabled="running" @click="runNow">
            {{ running ? 'Running…' : 'Run now' }}
          </button>
        </div>
        <table class="adm-table">
          <tbody>
            <tr v-for="[name, label] in JOB_LABELS" :key="name">
              <td>{{ label }}</td>
              <td>
                <template v-if="d.jobs?.[name]">
                  {{ d.jobs[name]!.ok ? 'OK' : 'Failed' }} · {{ new Date(d.jobs[name]!.at).toLocaleString() }}
                </template>
                <template v-else>Never run</template>
              </td>
              <td>
                {{ d.jobs?.[name]?.detail }}
                <a v-if="d.jobs?.[name]?.url" :href="d.jobs[name]!.url" target="_blank" rel="noopener">commit</a>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="adm-card adm-form" aria-labelledby="adm-medium">
        <h2 id="adm-medium" class="adm-h2">Medium</h2>
        <label class="adm-field">
          <span>Medium feed URL</span>
          <input v-model="medium" type="text" placeholder="https://medium.com/feed/@username" />
        </label>
        <div class="adm-actions">
          <button type="button" class="adm-btn" @click="saveMedium">Save</button>
          <button type="button" class="adm-btn" :disabled="syncing" @click="checkNow">
            {{ syncing ? 'Checking…' : 'Check now' }}
          </button>
          <span class="adm-muted">Last sync: {{ d.lastSync ? new Date(d.lastSync).toLocaleString() : '—' }}</span>
        </div>
      </section>

      <section class="adm-form" aria-labelledby="adm-posts">
        <div class="adm-head">
          <h2 id="adm-posts" class="adm-h2">Posts</h2>
          <input
            v-model="query"
            type="search"
            placeholder="Search posts"
            aria-label="Search posts"
            style="max-width: 260px"
          />
        </div>
        <p v-if="d.feedsError" class="adm-banner adm-banner-error" role="alert">{{ d.feedsError }}</p>
        <table class="adm-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Source</th>
              <th>Status</th>
              <th>Date</th>
              <th><span class="adm-visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.key">
              <td>{{ r.title }}</td>
              <td>{{ r.source }}</td>
              <td>
                <span
                  class="adm-status"
                  :class="{
                    'adm-status-draft': r.status === 'Draft' || r.status.startsWith('Scheduled'),
                    'adm-status-hidden': r.status === 'Hidden',
                  }"
                  >{{ r.status }}</span
                >
              </td>
              <td>{{ r.date }}</td>
              <td>
                <a v-if="r.slug" class="adm-btn adm-btn-small" :href="`${base}/posts/${r.slug}`">Edit</a>
                <button
                  v-else-if="r.status === 'Hidden'"
                  type="button"
                  class="adm-btn adm-btn-small"
                  @click="setHidden(r, false)"
                >
                  Unhide
                </button>
                <button v-else type="button" class="adm-btn adm-btn-small" @click="setHidden(r, true)">Hide</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!rows.length" class="adm-muted">No posts match.</p>
      </section>
    </template>
  </AdminShell>
</template>

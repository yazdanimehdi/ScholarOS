<script setup lang="ts">
import { ref } from 'vue';
import { api, committed, report, session } from './api';
import { vDialog } from './dialog';
import type { CommitResult } from './types';

/**
 * `stale`: the draft predates the loaded version; lists the top-level keys that differ (null when not stale).
 * `path`/`version`: the open document, for its History (Postgres mode only).
 */
const props = defineProps<{
  draft: boolean;
  conflict: boolean;
  stale?: string[] | null;
  path?: string;
  version?: string | null;
}>();
const emit = defineEmits<{ restore: []; discard: []; reload: [] }>();

interface Revision {
  id: string;
  version: number;
  created_at: string;
  author: string | null;
  deleted: boolean;
}
const historyOpen = ref(false);
const revisions = ref<Revision[]>([]);
const preview = ref<{ id: string; content: string | null } | null>(null);

async function showHistory() {
  historyOpen.value = true;
  preview.value = null;
  try {
    revisions.value = await api<Revision[]>(`history?path=${encodeURIComponent(props.path ?? '')}`);
  } catch (e) {
    report(e);
  }
}

async function showRevision(id: string) {
  try {
    preview.value = { id, ...(await api<{ content: string | null }>(`history/${id}`)) };
  } catch (e) {
    report(e);
  }
}

/** A 409 means the document changed since it was loaded: the toast says so; reload, then restore again. */
async function restoreRevision(id: string) {
  try {
    committed(await api<CommitResult>(`history/${id}/restore`, { body: { version: props.version ?? null } }));
    historyOpen.value = false;
    emit('reload');
  } catch (e) {
    report(e);
  }
}
</script>

<template>
  <p v-if="session.mode === 'postgres' && path" class="adm-history-bar">
    <button type="button" class="adm-btn adm-btn-small" @click="showHistory">History</button>
  </p>
  <div
    v-if="historyOpen"
    v-dialog
    class="adm-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="adm-history-title"
  >
    <div>
      <h2 id="adm-history-title" class="adm-h2">History</h2>
      <p v-if="revisions.length === 0" class="adm-muted">No saved versions yet.</p>
      <ol class="adm-history">
        <li v-for="r in revisions" :key="r.id">
          <span
            >{{ new Date(r.created_at).toLocaleString() }} · {{ r.author ?? 'unknown'
            }}<strong v-if="r.deleted"> · deleted</strong></span
          >
          <span v-if="!r.deleted" class="adm-actions">
            <button type="button" class="adm-btn adm-btn-small" @click="showRevision(r.id)">Preview</button>
            <button type="button" class="adm-btn adm-btn-small" @click="restoreRevision(r.id)">Restore</button>
          </span>
        </li>
      </ol>
      <pre v-if="preview" class="adm-history-preview" aria-label="Revision preview">{{ preview.content }}</pre>
      <div class="adm-actions">
        <button type="button" class="adm-btn" @click="historyOpen = false">Close</button>
      </div>
    </div>
  </div>
  <div v-if="conflict" v-dialog class="adm-modal" role="dialog" aria-modal="true" aria-labelledby="adm-conflict-title">
    <div>
      <h2 id="adm-conflict-title" class="adm-h2">This file changed since you opened it</h2>
      <p>
        Someone, or an automated job, saved a newer version. Reload to get it. Your edits stay in this browser, and you
        can re-apply them after reloading.
      </p>
      <div class="adm-actions">
        <button type="button" class="adm-btn adm-btn-primary" @click="$emit('reload')">Reload</button>
      </div>
    </div>
  </div>
  <p v-if="draft" class="adm-banner" role="status">
    <span>
      You have unsaved edits from an earlier session.
      <strong v-if="stale">
        This draft was made from an older version. Restoring it replaces the newer version, including changes made
        since<template v-if="stale.length">: {{ stale.join(', ') }}</template
        >.
      </strong>
    </span>
    <span class="adm-actions">
      <button type="button" class="adm-btn adm-btn-small" @click="$emit('restore')">Restore edits</button>
      <button type="button" class="adm-btn adm-btn-small" @click="$emit('discard')">Discard</button>
    </span>
  </p>
</template>

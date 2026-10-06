<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, committed, report, toast } from './api';
import type { CommitResult, MediaFile } from './types';

const props = defineProps<{ folder: 'content' | 'site'; pickable?: boolean }>();
const emit = defineEmits<{ pick: [url: string] }>();
const files = ref<MediaFile[]>([]);
const loading = ref(true);
const busy = ref(false);
const over = ref(false);
const confirming = ref<string | null>(null);
// Content images are processed at build time and have no URL in production; only `astro dev` serves them.
const showPreview = props.folder === 'site' || import.meta.env.DEV;
const fileName = (f: MediaFile) => f.path.slice(f.path.lastIndexOf('/') + 1);

onMounted(async () => {
  try {
    files.value = await api<MediaFile[]>(`media?folder=${props.folder}`);
  } catch (e) {
    report(e);
  } finally {
    loading.value = false;
  }
});

async function upload(list: FileList | null | undefined) {
  if (!list?.length) return;
  busy.value = true;
  for (const file of [...list]) {
    const form = new FormData();
    form.append('file', file);
    form.append('folder', props.folder);
    try {
      const uploaded = await api<MediaFile & { commit: Pick<CommitResult, 'id' | 'url'> | null }>('media', { form });
      if (uploaded.commit) committed(uploaded.commit);
      else toast(`${fileName(uploaded)} is already in the library`);
      files.value = [uploaded, ...files.value.filter((f) => f.path !== uploaded.path)];
    } catch (e) {
      report(e);
    }
  }
  busy.value = false;
}

async function remove(f: MediaFile) {
  if (confirming.value !== f.path) {
    confirming.value = f.path;
    return;
  }
  confirming.value = null;
  try {
    committed(await api<CommitResult>('media', { method: 'DELETE', body: { path: f.path, version: f.version } }));
    files.value = files.value.filter((x) => x.path !== f.path);
  } catch (e) {
    report(e);
  }
}

function copy(f: MediaFile) {
  navigator.clipboard.writeText(f.url).then(
    () => toast(`Copied ${f.url}`),
    () => toast(f.url),
  );
}

function drop(e: DragEvent) {
  over.value = false;
  upload(e.dataTransfer?.files);
}
</script>

<template>
  <div class="adm-form">
    <label
      class="adm-drop"
      :class="{ 'is-over': over }"
      @dragover.prevent="over = true"
      @dragleave="over = false"
      @drop.prevent="drop"
    >
      {{ busy ? 'Uploading…' : 'Drop images here or click to choose (PNG, JPEG, WebP, GIF, AVIF, SVG; up to 4 MB)' }}
      <input
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
        class="adm-visually-hidden"
        aria-label="Upload images"
        @change="upload(($event.target as HTMLInputElement).files)"
      />
    </label>
    <p v-if="loading" class="adm-muted">Loading…</p>
    <p v-else-if="!files.length" class="adm-muted">No images yet.</p>
    <div class="adm-media">
      <figure v-for="f in files" :key="f.path">
        <img v-if="showPreview" :src="f.url" :alt="fileName(f)" loading="lazy" />
        <div v-else class="adm-thumb" aria-hidden="true">{{ fileName(f).split('.').pop()?.toUpperCase() }}</div>
        <figcaption>{{ fileName(f) }}</figcaption>
        <div class="adm-actions">
          <button
            v-if="pickable"
            type="button"
            class="adm-btn adm-btn-small adm-btn-primary"
            @click="emit('pick', f.url)"
          >
            Use
          </button>
          <button type="button" class="adm-btn adm-btn-small" @click="copy(f)">Copy path</button>
          <button type="button" class="adm-btn adm-btn-small adm-btn-danger" @click="remove(f)">
            {{ confirming === f.path ? 'Confirm delete' : 'Delete' }}
          </button>
        </div>
      </figure>
    </div>
  </div>
</template>

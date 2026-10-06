<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AdminShell from './AdminShell.vue';
import { api, report } from './api';
import type { AdminCtx, Entry } from './types';

const props = defineProps<{ ctx: AdminCtx }>();
const base = `/${props.ctx.adminPath}`;
const posts = ref<Entry[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    posts.value = (await api<Entry[]>('collections/posts')).sort((a, b) =>
      String(b.data.date).localeCompare(String(a.data.date)),
    );
  } catch (e) {
    report(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <AdminShell :ctx="ctx" active="posts" title="Posts">
    <template #actions>
      <a class="adm-btn adm-btn-primary" :href="`${base}/posts/new`">New post</a>
    </template>
    <table class="adm-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in posts" :key="p.slug">
          <td>
            <a :href="`${base}/posts/${p.slug}`">{{ p.data.title || p.slug }}</a>
          </td>
          <td>
            <span class="adm-status" :class="{ 'adm-status-draft': p.data.draft }">{{
              p.data.draft ? 'Draft' : 'Published'
            }}</span>
          </td>
          <td>{{ String(p.data.date ?? '').slice(0, 10) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!loading && !posts.length" class="adm-muted">No posts yet.</p>
  </AdminShell>
</template>

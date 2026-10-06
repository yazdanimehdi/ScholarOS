<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, toasts } from './api';
import type { AdminCtx } from './types';

const props = defineProps<{ ctx: AdminCtx; active: string; title: string }>();
const base = `/${props.ctx.adminPath}`;
const banner = ref('');
const contentOpen = ref(props.active.startsWith('content/'));
// Phones (under 860px): the nav is a menu, closed until opened. Links reload the page, which closes it again.
const menuOpen = ref(false);
const TOP = [
  ['', 'Dashboard'],
  ['posts', 'Posts'],
  ['cv', 'CV'],
  ['publications', 'Publications'],
] as const;
const CONTENT = [
  ['announcements', 'News'],
  ['people', 'People'],
  ['projects', 'Projects'],
  ['talks', 'Talks'],
  ['positions', 'Positions'],
] as const;
const BOTTOM = [
  ['pages', 'Pages'],
  ['media', 'Media'],
  ['settings', 'Settings'],
] as const;
const href = (path: string) => (path ? `${base}/${path}` : base);

onMounted(async () => {
  try {
    const { capabilities } = await api<{ capabilities: { error?: string } }>('me');
    banner.value = capabilities.error ?? '';
  } catch {
    // 401 reloads to the login page; other errors surface on the first save
  }
});

async function signOut() {
  await api('auth/logout', { method: 'POST' }).catch(() => undefined);
  location.href = `${base}/login`;
}
</script>

<template>
  <div class="adm-layout">
    <aside class="adm-side">
      <div class="adm-side-top">
        <div>
          <strong>{{ ctx.siteName }}</strong>
          <div class="adm-muted">Site admin</div>
        </div>
        <button
          type="button"
          class="adm-btn adm-btn-small adm-menu-btn"
          aria-controls="adm-nav"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          Menu
        </button>
      </div>
      <nav id="adm-nav" aria-label="Admin" :class="{ 'is-open': menuOpen }">
        <a
          v-for="[path, label] in TOP"
          :key="path"
          :href="href(path)"
          :aria-current="active === path ? 'page' : undefined"
          >{{ label }}</a
        >
        <button type="button" :aria-expanded="contentOpen" @click="contentOpen = !contentOpen">
          Content {{ contentOpen ? '▾' : '▸' }}
        </button>
        <template v-if="contentOpen">
          <a
            v-for="[name, label] in CONTENT"
            :key="name"
            class="adm-sub"
            :href="href(`content/${name}`)"
            :aria-current="active === `content/${name}` ? 'page' : undefined"
            >{{ label }}</a
          >
        </template>
        <a
          v-for="[path, label] in BOTTOM"
          :key="path"
          :href="href(path)"
          :aria-current="active === path ? 'page' : undefined"
          >{{ label }}</a
        >
      </nav>
      <div class="adm-side-foot">
        <a href="/" target="_blank" rel="noopener">View site ↗</a>
        <button type="button" class="adm-btn adm-btn-small" @click="signOut">Sign out</button>
      </div>
    </aside>
    <main class="adm-main">
      <p v-if="banner" class="adm-banner adm-banner-error" role="alert">{{ banner }}</p>
      <div class="adm-head">
        <h1>{{ title }}</h1>
        <div class="adm-actions"><slot name="actions" /></div>
      </div>
      <slot />
    </main>
    <div class="adm-toasts" aria-live="polite">
      <div v-for="t in toasts" :key="t.id" class="adm-toast">
        {{ t.text }}<a v-if="t.href" :href="t.href" target="_blank" rel="noopener">View commit</a>
      </div>
    </div>
  </div>
</template>

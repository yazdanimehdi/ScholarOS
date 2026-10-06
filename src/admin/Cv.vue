<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AdminShell from './AdminShell.vue';
import DocBanners from './DocBanners.vue';
import FormFields from './FormFields.vue';
import { vDialog } from './dialog';
import { api, report, toast } from './api';
import {
  CV_BLANK,
  CV_FIELDS,
  cvEntryKind,
  cvEntryPreview,
  sectionKey,
  sectionLabel,
  validSectionKey,
  type CvEntryKind,
} from './fields';
import { useDocument } from './useDocument';
import type { AdminCtx, CommitResult, Entry } from './types';

interface CvDoc {
  cv: { name: string; sections?: Record<string, unknown[]>; [key: string]: unknown };
  [key: string]: unknown;
}
interface PendingPublication {
  slug: string;
  data: Record<string, unknown>;
  body: string;
  version: string | null;
}
interface ImportPreview {
  cv: CvDoc;
  publications: PendingPublication[];
  summary: {
    sections: { key: string; count: number }[];
    newPublications: number;
    updatedPublications: number;
    skipped: number;
  };
}
interface Run {
  status: string;
  conclusion: string | null;
  url: string;
}

defineProps<{ ctx: AdminCtx }>();
const doc = useDocument<CvDoc>();
const upload = ref<{ enabled: boolean; version: string | null }>({ enabled: false, version: null });
const publicationCount = ref(0);
const section = ref<string | null>(null);
const index = ref<number | null>(null);
const kind = ref<CvEntryKind>('normal');
const newKind = ref<CvEntryKind>('normal');
const newSection = ref('');
const confirmSection = ref(false);
const confirmEntry = ref(false);
const pending = ref<PendingPublication[]>([]);
const turnOffUpload = ref(false);
const importing = ref(false);
const importText = ref('');
const preview = ref<ImportPreview | null>(null);
const pdf = ref<Run | null>(null);
// The imported publications and the upload switch belong to the CV draft: keep them across reloads with it.
const IMPORT_KEY = 'scholaros-cv-import';
try {
  const saved = JSON.parse(localStorage.getItem(IMPORT_KEY) ?? 'null');
  if (saved) {
    pending.value = saved.pending ?? [];
    turnOffUpload.value = !!saved.turnOffUpload;
  }
} catch {
  // Storage blocked or corrupt: nothing to restore.
}
watch(
  [pending, turnOffUpload],
  () => {
    try {
      if (pending.value.length || turnOffUpload.value) {
        localStorage.setItem(
          IMPORT_KEY,
          JSON.stringify({ pending: pending.value, turnOffUpload: turnOffUpload.value }),
        );
      } else localStorage.removeItem(IMPORT_KEY);
    } catch {
      // Storage full or blocked: drafts are a convenience.
    }
  },
  { deep: true },
);
function discardDraft() {
  doc.discard();
  pending.value = [];
  turnOffUpload.value = false;
}
let pdfTimer: number | undefined;
let pdfStarted = 0;
let unmounted = false;

const KINDS: [CvEntryKind, string][] = [
  ['normal', 'Normal (name, dates, highlights)'],
  ['experience', 'Experience'],
  ['education', 'Education'],
  ['oneLine', 'One line (label: details)'],
  ['bullet', 'Bullet'],
  ['text', 'Text'],
  ['publication', 'Publication'],
];

const sections = computed<Record<string, unknown[]>>(() => doc.current?.cv.sections ?? {});
const keys = computed(() => Object.keys(sections.value));
const entries = computed(() => (section.value ? (sections.value[section.value] ?? []) : []));
const entry = computed(() => (index.value === null ? undefined : entries.value[index.value]));
const entryPreview = computed(() => cvEntryPreview(entry.value));
const pdfLabel = computed(() => {
  if (!pdf.value) return '';
  if (pdf.value.status !== 'completed') return 'PDF: generating…';
  return pdf.value.conclusion === 'success' ? 'PDF: up to date' : `PDF: last run ${pdf.value.conclusion}`;
});

function setSections(next: Record<string, unknown[]>) {
  if (doc.current) doc.current.cv.sections = next;
}

onMounted(async () => {
  await doc.open('config/cv', async () => {
    const { data, version } = await api<{ data: CvDoc; version: string | null }>('config/cv');
    data.cv ??= { name: '' };
    data.cv.sections ??= {};
    return { value: data, version };
  });
  section.value = keys.value[0] ?? null;
  try {
    const [cvUpload, publications] = await Promise.all([
      api<{ data: { enabled?: boolean }; version: string | null }>('config/cv-upload'),
      api<Entry[]>('collections/publications'),
    ]);
    upload.value = { enabled: !!cvUpload.data.enabled, version: cvUpload.version };
    publicationCount.value = publications.length;
  } catch (e) {
    report(e);
  }
  checkPdf();
});
onBeforeUnmount(() => {
  unmounted = true;
  clearTimeout(pdfTimer);
});

// ── Sections ──
function selectSection(key: string | null) {
  section.value = key;
  index.value = null;
  confirmSection.value = false;
  confirmEntry.value = false;
}
const NEEDS_LETTER = 'Section names need at least one letter';
function addSection() {
  if (!newSection.value.trim()) return;
  const key = sectionKey(newSection.value);
  if (!validSectionKey(key)) return toast(NEEDS_LETTER);
  if (key in sections.value) return toast(`There is already a "${sectionLabel(key)}" section`);
  setSections({ ...sections.value, [key]: [] });
  newSection.value = '';
  selectSection(key);
}
function renameSection() {
  if (!section.value) return;
  const name = window.prompt('Section name', sectionLabel(section.value));
  if (!name?.trim()) return;
  const key = sectionKey(name);
  if (!validSectionKey(key)) return toast(NEEDS_LETTER);
  if (key === section.value) return;
  if (key in sections.value) return toast(`There is already a "${sectionLabel(key)}" section`);
  const old = section.value;
  setSections(Object.fromEntries(Object.entries(sections.value).map(([k, v]) => [k === old ? key : k, v])));
  section.value = key;
}
function deleteSection() {
  if (!section.value) return;
  if (!confirmSection.value) {
    confirmSection.value = true;
    return;
  }
  const rest = Object.fromEntries(Object.entries(sections.value).filter(([k]) => k !== section.value));
  setSections(rest);
  selectSection(Object.keys(rest)[0] ?? null);
}

// ── Entries ──
function selectEntry(i: number) {
  index.value = i;
  kind.value = cvEntryKind(entries.value[i]);
  confirmEntry.value = false;
}
function setEntries(list: unknown[]) {
  if (section.value) setSections({ ...sections.value, [section.value]: list });
}
function addEntry() {
  if (!section.value) return;
  const entryKind = entries.value.length ? cvEntryKind(entries.value[0]) : newKind.value;
  setEntries([...entries.value, CV_BLANK[entryKind]()]);
  selectEntry(entries.value.length - 1);
}
function moveEntry(by: number) {
  if (index.value === null) return;
  const to = index.value + by;
  if (to < 0 || to >= entries.value.length) return;
  const list = [...entries.value];
  [list[index.value], list[to]] = [list[to], list[index.value]];
  setEntries(list);
  index.value = to;
}
function deleteEntry() {
  if (index.value === null) return;
  if (!confirmEntry.value) {
    confirmEntry.value = true;
    return;
  }
  setEntries(entries.value.filter((_, i) => i !== index.value));
  index.value = null;
  confirmEntry.value = false;
}
function setText(value: string) {
  if (index.value !== null) setEntries(entries.value.map((e, i) => (i === index.value ? value : e)));
}
function setVisible(visible: boolean) {
  const e = entry.value as Record<string, unknown> | undefined;
  if (!e || typeof e !== 'object') return;
  if (visible) delete e.visible;
  else e.visible = false;
}

// ── Publish ──
async function publish() {
  const result = await doc.save(
    (cv, cvVersion) =>
      api<CommitResult>('cv/publish', {
        method: 'POST',
        body: {
          cv,
          cvVersion,
          publications: pending.value,
          ...(turnOffUpload.value ? { uploadVersion: upload.value.version } : {}),
        },
      }),
    'config/cv.yml',
  );
  if (!result) return;
  publicationCount.value += pending.value.filter((p) => !p.version).length;
  pending.value = [];
  if (turnOffUpload.value) {
    upload.value = { enabled: false, version: result.versions['config/cv-upload.yml'] ?? null };
    turnOffUpload.value = false;
  }
}

// ── Import ──
async function readFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) importText.value = await file.text();
}
async function previewImport() {
  preview.value = null;
  try {
    preview.value = await api<ImportPreview>('cv/import', { body: { yaml: importText.value } });
  } catch (e) {
    report(e);
  }
}
function applyImport() {
  if (!preview.value) return;
  const cv = preview.value.cv;
  doc.current = { ...cv, cv: { ...cv.cv, sections: cv.cv.sections ?? {} } };
  pending.value = preview.value.publications;
  turnOffUpload.value = upload.value.enabled;
  selectSection(Object.keys(doc.current.cv.sections ?? {})[0] ?? null);
  closeImport();
  toast('Imported into the editor. Review it, then click Publish.');
}
function closeImport() {
  importing.value = false;
  preview.value = null;
  importText.value = '';
}

// ── PDF (GitHub Actions: render-cv.yml) ──
async function checkPdf() {
  try {
    const { run } = await api<{ run: Run | null }>('cv/pdf');
    pdf.value = run;
    const justStarted = Date.now() - pdfStarted < 60_000; // a new run takes a moment to appear
    if (unmounted) return;
    if ((run && run.status !== 'completed') || justStarted) pdfTimer = window.setTimeout(checkPdf, 5000);
  } catch (e) {
    report(e);
  }
}
async function generatePdf() {
  try {
    await api('cv/pdf', { method: 'POST' });
    pdfStarted = Date.now();
    toast('PDF generation started on GitHub Actions');
    clearTimeout(pdfTimer);
    if (!unmounted) pdfTimer = window.setTimeout(checkPdf, 4000);
  } catch (e) {
    report(e);
  }
}
</script>

<template>
  <AdminShell :ctx="ctx" active="cv" title="CV">
    <template #actions>
      <span v-if="pdf" class="adm-muted"
        >{{ pdfLabel }} · <a :href="pdf.url" target="_blank" rel="noopener">run</a></span
      >
      <button type="button" class="adm-btn" @click="importing = true">Import YAML</button>
      <button type="button" class="adm-btn" @click="generatePdf">Generate PDF</button>
      <button type="button" class="adm-btn adm-btn-primary" :disabled="doc.saving || !doc.current" @click="publish">
        Publish
      </button>
    </template>

    <p v-if="upload.enabled && !turnOffUpload" class="adm-banner">
      A raw RenderCV upload (config/cv-upload.yml) is turned on and replaces this CV on the site. Importing YAML here
      turns the upload off.
    </p>
    <p v-if="turnOffUpload" class="adm-banner">Publishing will turn off the raw RenderCV upload.</p>
    <p v-if="pending.length" class="adm-banner">
      {{ pending.length }} publication(s) from the import will be saved to Publications when you publish.
    </p>
    <DocBanners
      :draft="!!doc.draft"
      :conflict="doc.conflict"
      :stale="doc.draftStale ? doc.draftChanges : null"
      @restore="doc.restore()"
      @discard="discardDraft"
      @reload="doc.reload()"
    />

    <div v-if="doc.current" class="adm-cols3">
      <section aria-label="Sections" class="adm-form">
        <ul class="adm-pick">
          <li v-for="key in keys" :key="key">
            <button type="button" :aria-current="section === key" @click="selectSection(key)">
              <span>{{ sectionLabel(key) }}</span
              ><span class="adm-muted">{{ sections[key].length }}</span>
            </button>
          </li>
        </ul>
        <ul class="adm-pick">
          <li>
            <a :href="`/${ctx.adminPath}/publications`"
              ><span>Publications collection ↗</span><span class="adm-muted">{{ publicationCount }}</span></a
            >
          </li>
        </ul>
        <div class="adm-list-row">
          <input
            v-model="newSection"
            type="text"
            placeholder="New section"
            aria-label="New section name"
            @keydown.enter="addSection"
          />
          <button type="button" class="adm-btn adm-btn-small" @click="addSection">Add</button>
        </div>
        <div v-if="section" class="adm-actions">
          <button type="button" class="adm-btn adm-btn-small" @click="renameSection">Rename</button>
          <button type="button" class="adm-btn adm-btn-small adm-btn-danger" @click="deleteSection">
            {{ confirmSection ? 'Click again to delete' : 'Delete section' }}
          </button>
        </div>
      </section>

      <section aria-label="Entries" class="adm-form">
        <ul class="adm-pick">
          <li v-for="(e, i) in entries" :key="i">
            <button type="button" :aria-current="index === i" @click="selectEntry(i)">
              <span>{{ cvEntryPreview(e).title || '(untitled)' }}</span>
              <span v-if="(e as any)?.visible === false" class="adm-muted">hidden</span>
            </button>
          </li>
        </ul>
        <p v-if="section && !entries.length" class="adm-muted">No entries yet.</p>
        <div v-if="section" class="adm-actions">
          <select v-if="!entries.length" v-model="newKind" aria-label="Entry type">
            <option v-for="[k, label] in KINDS" :key="k" :value="k">{{ label }}</option>
          </select>
          <button type="button" class="adm-btn adm-btn-small" @click="addEntry">+ Entry</button>
          <template v-if="index !== null">
            <button type="button" class="adm-btn adm-btn-small" aria-label="Move entry up" @click="moveEntry(-1)">
              ↑
            </button>
            <button type="button" class="adm-btn adm-btn-small" aria-label="Move entry down" @click="moveEntry(1)">
              ↓
            </button>
            <button type="button" class="adm-btn adm-btn-small adm-btn-danger" @click="deleteEntry">
              {{ confirmEntry ? 'Click again to delete' : 'Delete' }}
            </button>
          </template>
        </div>
      </section>

      <section aria-label="Entry" class="adm-form">
        <template v-if="entry !== undefined && section && index !== null">
          <label v-if="kind === 'text'" class="adm-field">
            <span>Text</span>
            <textarea :value="String(entry)" rows="5" @input="setText(($event.target as HTMLTextAreaElement).value)" />
          </label>
          <template v-else>
            <label class="adm-check">
              <input
                type="checkbox"
                :checked="(entry as any).visible !== false"
                @change="setVisible(($event.target as HTMLInputElement).checked)"
              />
              Visible
            </label>
            <FormFields
              :fields="CV_FIELDS[kind as Exclude<CvEntryKind, 'text'>]"
              :model="entry as Record<string, any>"
              :errors="doc.errors"
              :prefix="`cv.sections.${section}.${index}.`"
              :owner="ctx.siteName"
            />
          </template>
          <section class="adm-card" aria-label="Preview">
            <strong>{{ entryPreview.title || '(untitled)' }}</strong>
            <div v-if="entryPreview.org" class="adm-muted">{{ entryPreview.org }}</div>
            <div v-if="entryPreview.when" class="adm-muted">{{ entryPreview.when }}</div>
            <ul v-if="entryPreview.points.length">
              <li v-for="(point, i) in entryPreview.points" :key="i">{{ point }}</li>
            </ul>
          </section>
        </template>
        <p v-else class="adm-muted">Choose an entry.</p>
      </section>
    </div>

    <div
      v-if="importing"
      v-dialog
      class="adm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adm-import-title"
      @keydown.esc="closeImport"
    >
      <div>
        <h2 id="adm-import-title" class="adm-h2">Import a RenderCV YAML file</h2>
        <p class="adm-muted">
          The import replaces the CV in this editor and moves publication sections into Publications. Papers that
          already exist are updated, not duplicated. Nothing is saved until you click Publish.
        </p>
        <input type="file" accept=".yaml,.yml,text/yaml" aria-label="RenderCV file" @change="readFile" />
        <label class="adm-field">
          <span>Or paste the YAML</span>
          <textarea v-model="importText" rows="10" />
        </label>
        <div v-if="preview" class="adm-card">
          <p>
            <strong>{{ preview.cv.cv.name }}</strong>
          </p>
          <ul>
            <li v-for="s in preview.summary.sections" :key="s.key">{{ sectionLabel(s.key) }}: {{ s.count }}</li>
          </ul>
          <p>
            Publications: {{ preview.summary.newPublications }} new,
            {{ preview.summary.updatedPublications }} updated<span v-if="preview.summary.skipped"
              >, {{ preview.summary.skipped }} skipped (MDX)</span
            >.
          </p>
        </div>
        <div class="adm-actions">
          <button
            v-if="!preview"
            type="button"
            class="adm-btn adm-btn-primary"
            :disabled="!importText.trim()"
            @click="previewImport"
          >
            Preview
          </button>
          <button v-else type="button" class="adm-btn adm-btn-primary" @click="applyImport">Apply to editor</button>
          <button type="button" class="adm-btn" @click="closeImport">Cancel</button>
        </div>
      </div>
    </div>
  </AdminShell>
</template>

<script setup lang="ts">
import type { ChainedCommands } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import 'katex/dist/katex.min.css';
import { ref, watch } from 'vue';
import MediaGrid from './MediaGrid.vue';
import { editorExtensions } from './editor/extensions';

const props = defineProps<{ modelValue: string; compact?: boolean; preview?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const host = ref<HTMLElement>();
const picking = ref(false);
const slash = ref<{ top: number; left: number } | null>(null);
const vFocus = { mounted: (el: HTMLElement) => el.focus() };
// In preview the content takes the public post styles (.ed-prose from editorial.css).
const contentClass = (preview?: boolean) => (preview ? 'tiptap ed-prose' : 'tiptap');

function editMath(kind: 'inline' | 'block', node: PMNode, pos: number) {
  const latex = window.prompt('LaTeX', String(node.attrs.latex ?? ''));
  if (latex === null || !editor.value) return;
  const chain = editor.value.chain().setNodeSelection(pos);
  (kind === 'inline' ? chain.updateInlineMath({ latex }) : chain.updateBlockMath({ latex })).focus().run();
}

const editor = useEditor({
  extensions: editorExtensions(editMath),
  content: props.modelValue,
  contentType: 'markdown',
  editable: !props.preview,
  editorProps: { attributes: { class: contentClass(props.preview) } },
  onUpdate: ({ editor: e }) => {
    emit('update:modelValue', e.getMarkdown());
    updateSlash();
  },
  onSelectionUpdate: () => updateSlash(),
});

watch(
  () => props.modelValue,
  (markdown) => {
    if (editor.value && markdown !== editor.value.getMarkdown()) {
      editor.value.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
    }
  },
);
watch(
  () => props.preview,
  (preview) => {
    editor.value?.setEditable(!preview);
    editor.value?.setOptions({ editorProps: { attributes: { class: contentClass(preview) } } });
  },
);

function run(command: (chain: ChainedCommands) => ChainedCommands) {
  if (editor.value) command(editor.value.chain().focus()).run();
}

function link() {
  const previous = editor.value?.getAttributes('link').href as string | undefined;
  const href = window.prompt('Link URL (leave empty to remove the link)', previous ?? 'https://');
  if (href === null) return;
  run((c) => (href ? c.extendMarkRange('link').setLink({ href }) : c.extendMarkRange('link').unsetLink()));
}

function equation(block: boolean) {
  const latex = window.prompt(block ? 'LaTeX (display equation)' : 'LaTeX', '');
  if (latex) run((c) => (block ? c.insertBlockMath({ latex }) : c.insertInlineMath({ latex })));
}

function insertImage(url: string) {
  picking.value = false;
  const alt = window.prompt('Alt text: describe the image for screen readers', '') ?? '';
  run((c) => c.setImage({ src: url, alt }));
}

type Active = string | [string, Record<string, unknown>];
const TOOLBAR: { label: string; title: string; active?: Active; action: () => void }[] = [
  { label: 'B', title: 'Bold', active: 'bold', action: () => run((c) => c.toggleBold()) },
  { label: 'I', title: 'Italic', active: 'italic', action: () => run((c) => c.toggleItalic()) },
  { label: 'H', title: 'Heading', active: ['heading', { level: 2 }], action: () => run((c) => c.toggleHeading({ level: 2 })) },
  { label: '❝', title: 'Quote', active: 'blockquote', action: () => run((c) => c.toggleBlockquote()) },
  { label: 'Link', title: 'Link', active: 'link', action: link },
  { label: '•', title: 'List', active: 'bulletList', action: () => run((c) => c.toggleBulletList()) },
  { label: '</>', title: 'Code', active: 'code', action: () => run((c) => c.toggleCode()) },
  { label: '∑', title: 'Equation', action: () => equation(false) },
  { label: 'Img', title: 'Image', action: () => (picking.value = true) },
];
const isActive = (a?: Active) =>
  !!a && !!editor.value && (Array.isArray(a) ? editor.value.isActive(a[0], a[1]) : editor.value.isActive(a));

const SLASH: [string, () => void][] = [
  ['Heading', () => run((c) => c.setNode('heading', { level: 2 }))],
  ['Quote', () => run((c) => c.setBlockquote())],
  ['Code block', () => run((c) => c.setCodeBlock())],
  ['Equation', () => equation(true)],
  ['Image', () => (picking.value = true)],
  ['Table', () => run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))],
];

/** The "/" menu opens when an empty paragraph holds just "/". */
function updateSlash() {
  const ed = editor.value;
  if (!ed || props.compact || !host.value) return;
  const { $from, empty } = ed.state.selection;
  if (!empty || $from.parent.type.name !== 'paragraph' || $from.parent.textContent !== '/') {
    slash.value = null;
    return;
  }
  const at = ed.view.coordsAtPos($from.pos);
  const box = host.value.getBoundingClientRect();
  slash.value = { top: at.bottom - box.top + 4, left: at.left - box.left };
}

function choose(action: () => void) {
  const ed = editor.value;
  if (!ed) return;
  const { $from } = ed.state.selection;
  ed.chain().focus().deleteRange({ from: $from.pos - 1, to: $from.pos }).run();
  slash.value = null;
  action();
}
</script>

<template>
  <div ref="host" class="adm-editor" :class="{ 'is-compact': compact }" @keydown.esc="slash = null">
    <div v-if="!preview" class="adm-toolbar" role="toolbar" aria-label="Formatting">
      <button
        v-for="t in TOOLBAR"
        :key="t.title"
        type="button"
        :title="t.title"
        :aria-label="t.title"
        :class="{ 'is-active': isActive(t.active) }"
        @click="t.action"
      >
        {{ t.label }}
      </button>
    </div>
    <EditorContent :editor="editor" />
    <div v-if="slash" class="adm-slash" role="menu" :style="{ top: `${slash.top}px`, left: `${slash.left}px` }">
      <button v-for="[label, action] in SLASH" :key="label" type="button" role="menuitem" @mousedown.prevent="choose(action)">
        {{ label }}
      </button>
    </div>
    <div v-if="picking" class="adm-modal" role="dialog" aria-modal="true" aria-label="Insert an image" @keydown.esc="picking = false">
      <div>
        <div class="adm-head">
          <h2 class="adm-h2">Insert an image</h2>
          <button v-focus type="button" class="adm-btn adm-btn-small" @click="picking = false">Close</button>
        </div>
        <MediaGrid folder="site" pickable @pick="insertImage" />
      </div>
    </div>
  </div>
</template>

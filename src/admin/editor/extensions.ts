import type { AnyExtension } from '@tiptap/core';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import type { Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';

/**
 * Pandoc's rule for inline math: no space just inside the dollars and no digit right after the closing one.
 * Tiptap's default tokenizer reads "$500K and $1M" as math and drops a space when it saves.
 */
export const INLINE_MATH = /^\$(?!\s)((?:\\.|[^$\\\n])*?[^\s$\\])\$(?![\d$])/;

const StrictInlineMath = InlineMath.extend({
  markdownTokenizer: {
    name: 'inlineMath',
    level: 'inline',
    start: (src: string) => src.indexOf('$'),
    tokenize: (src: string) => {
      const match = INLINE_MATH.exec(src);
      return match ? { type: 'inlineMath', raw: match[0], latex: match[1] } : undefined;
    },
  },
});

export type MathClick = (kind: 'inline' | 'block', node: PMNode, pos: number) => void;

/** The editor's schema: Markdown in and out ($…$ / $$…$$ math, ![alt](src) images, GFM tables). */
export function editorExtensions(onMathClick?: MathClick): AnyExtension[] {
  return [
    StarterKit.configure({ link: { openOnClick: false } }),
    Markdown,
    StrictInlineMath.configure({ onClick: onMathClick && ((node: PMNode, pos: number) => onMathClick('inline', node, pos)) }),
    BlockMath.configure({ onClick: onMathClick && ((node: PMNode, pos: number) => onMathClick('block', node, pos)) }),
    Image,
    TableKit,
  ];
}

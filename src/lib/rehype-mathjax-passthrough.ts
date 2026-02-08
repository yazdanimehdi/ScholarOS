import type { Root } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * Rehype plugin that converts remark-math's HAST nodes into MathJax-friendly HTML.
 *
 * remark-math produces:
 *   - Inline:  <code class="language-math math-inline">...</code>
 *   - Display: <pre><code class="language-math math-display">...</code></pre>
 *
 * This plugin converts them to:
 *   - Inline:  <span class="math-inline">\(...\)</span>
 *   - Display: <div class="math-display">\[...\]</div>
 *
 * MathJax then finds and renders them client-side.
 */
export function rehypeMathJaxPassthrough() {
  return (tree: Root) => {
    // Handle display math: <pre><code class="language-math math-display">
    visit(tree, 'element', (node, index, parent) => {
      if (
        node.tagName === 'pre' &&
        node.children.length === 1 &&
        node.children[0].type === 'element' &&
        node.children[0].tagName === 'code'
      ) {
        const code = node.children[0];
        const classes = Array.isArray(code.properties?.className) ? code.properties.className : [];

        if (classes.includes('language-math') && classes.includes('math-display')) {
          const mathText = extractText(code);
          if (parent && typeof index === 'number') {
            parent.children[index] = {
              type: 'element',
              tagName: 'div',
              properties: { className: ['math-display'] },
              children: [{ type: 'text', value: `\\[${mathText}\\]` }],
            };
          }
        }
      }
    });

    // Handle inline math: <code class="language-math math-inline">
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName === 'code') {
        const classes = Array.isArray(node.properties?.className) ? node.properties.className : [];

        if (classes.includes('language-math') && classes.includes('math-inline')) {
          const mathText = extractText(node);
          if (parent && typeof index === 'number') {
            parent.children[index] = {
              type: 'element',
              tagName: 'span',
              properties: { className: ['math-inline'] },
              children: [{ type: 'text', value: `\\(${mathText}\\)` }],
            };
          }
        }
      }
    });
  };
}

function extractText(node: any): string {
  let text = '';
  if (node.type === 'text') return node.value || '';
  if (node.children) {
    for (const child of node.children) {
      text += extractText(child);
    }
  }
  return text;
}

import type { Root, Element, RootContent } from 'hast';

/**
 * Rehype plugin that adds rel="nofollow noopener noreferrer" and target="_blank"
 * to external links in markdown/MDX content (matching al-folio's jekyll-link-attributes).
 */
export function rehypeExternalLinks() {
  return (tree: Root) => {
    walkNodes(tree.children);
  };
}

function walkNodes(nodes: RootContent[]) {
  for (const node of nodes) {
    if (node.type !== 'element') continue;
    const el = node as Element;

    if (el.tagName === 'a') {
      const href = el.properties?.href;
      if (typeof href === 'string' && (href.startsWith('http://') || href.startsWith('https://'))) {
        el.properties = el.properties || {};
        el.properties.target = '_blank';
        el.properties.rel = 'nofollow noopener noreferrer';
      }
    }

    if (el.children) {
      walkNodes(el.children);
    }
  }
}

import { isDeepStrictEqual } from 'node:util';
import { type Document, parse, parseDocument, stringify } from 'yaml';

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/;
/** No folding (keeps long lines as written), no padding inside [flow, lists]: matches the repo's files. */
const YAML_OUT = { lineWidth: 0, flowCollectionPadding: false } as const;

export function parseMarkdown(text: string): { data: Record<string, unknown>; body: string } {
  const match = FRONT_MATTER.exec(text);
  if (!match) return { data: {}, body: text };
  return { data: (parse(match[1]) ?? {}) as Record<string, unknown>, body: match[2].replace(/^\r?\n/, '') };
}

/** `---\n<yaml>---\n\n<body>`: keys in `keyOrder` first, then the rest in their existing order. */
export function serializeMarkdown(data: Record<string, unknown>, body: string, keyOrder: string[]): string {
  const ordered: Record<string, unknown> = {};
  for (const key of [...keyOrder, ...Object.keys(data)]) {
    if (!(key in ordered) && data[key] !== undefined) ordered[key] = data[key];
  }
  const yaml = Object.keys(ordered).length > 0 ? stringify(ordered, YAML_OUT) : '';
  const text = body.replace(/^\s*\n/, '').trimEnd();
  return `---\n${yaml}---\n${text ? `\n${text}\n` : ''}`;
}

const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Applies the difference between `prev` and `next` to the document node at `path`, recursing into maps and lists. */
function apply(doc: Document, path: (string | number)[], prev: unknown, next: unknown): void {
  if (isMap(prev) && isMap(next)) {
    for (const key of Object.keys(prev)) if (next[key] === undefined) doc.deleteIn([...path, key]);
    for (const [key, value] of Object.entries(next))
      if (value !== undefined) apply(doc, [...path, key], prev[key], value);
    return;
  }
  if (Array.isArray(prev) && Array.isArray(next)) {
    for (let i = prev.length - 1; i >= next.length; i--) doc.deleteIn([...path, i]);
    next.forEach((value, i) => (i < prev.length ? apply(doc, [...path, i], prev[i], value) : doc.addIn(path, value)));
    return;
  }
  if (!isDeepStrictEqual(prev, next)) doc.setIn(path, next);
}

/** Rewrites a YAML file to hold `next`, keeping comments, key order and the quoting of untouched values. */
export function updateYaml(source: string, next: unknown): string {
  const doc: Document = parseDocument(source);
  if (doc.contents === null) doc.contents = doc.createNode(next);
  else apply(doc, [], doc.toJS(), next);
  return doc.toString(YAML_OUT);
}

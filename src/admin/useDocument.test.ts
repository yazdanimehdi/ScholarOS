import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTick } from 'vue';
import { Window } from 'happy-dom';

// useDocument keeps drafts in localStorage.
const window = new Window();
Object.assign(globalThis, { window, localStorage: window.localStorage });

const { useDocument } = await import('./useDocument');
const { ApiError } = await import('./api');

type Doc = { title: string };
const KEY = 'scholaros-draft:k';
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null');
const draftOf = (value: Doc, base = 'v1') => ({ base, value });
const loader = (value: Doc) => async () => ({ value: { ...value }, version: 'v1' });
const flush = async () => {
  await nextTick();
  await nextTick();
};

async function opened(server: Doc, draft?: Doc) {
  localStorage.clear();
  if (draft) localStorage.setItem(KEY, JSON.stringify(draft));
  const doc = useDocument<Doc>();
  await doc.open('k', loader(server));
  return doc;
}

test('a differing stored draft is offered and survives edits made before restoring', async () => {
  const doc = await opened({ title: 'server' }, { title: 'draft' });
  assert.deepEqual(doc.draft, { title: 'draft' });
  doc.current!.title = 'server+edit';
  await flush();
  assert.deepEqual(stored(), { title: 'draft' });
});

test('restore() puts the draft in current and later edits are persisted', async () => {
  const doc = await opened({ title: 'server' }, { title: 'draft' });
  doc.restore();
  assert.equal(doc.current!.title, 'draft');
  assert.equal(doc.draft, null);
  await flush();
  doc.current!.title = 'edited';
  await flush();
  assert.deepEqual(stored(), draftOf({ title: 'edited' }));
});

test('a 409 keeps the draft; the next reload offers it again', async () => {
  const doc = await opened({ title: 'server' });
  doc.current!.title = 'mine';
  await flush();
  await doc.save(async () => {
    throw new ApiError(409, 'changed');
  }, 'p');
  assert.equal(doc.conflict, true);
  assert.deepEqual(stored(), draftOf({ title: 'mine' }));
  await doc.reload();
  assert.equal(doc.conflict, false);
  assert.deepEqual(doc.draft, { title: 'mine' });
  assert.deepEqual(stored(), draftOf({ title: 'mine' }));
});

test('a successful save clears the draft and takes the new version', async () => {
  const doc = await opened({ title: 'server' });
  doc.current!.title = 'mine';
  await flush();
  assert.deepEqual(stored(), draftOf({ title: 'mine' }));
  await doc.save(async () => ({ id: 'c', versions: { p: 'v2' } }), 'p');
  assert.equal(doc.version, 'v2');
  assert.equal(stored(), null);
});

test('retarget() makes reload() use the new loader and key', async () => {
  const doc = await opened({ title: 'new' });
  doc.retarget('k2', loader({ title: 'saved' }));
  assert.equal(doc.current!.title, 'new');
  await doc.reload();
  assert.equal(doc.current!.title, 'saved');
  doc.current!.title = 'edited';
  await flush();
  assert.deepEqual(JSON.parse(localStorage.getItem('scholaros-draft:k2') ?? 'null'), draftOf({ title: 'edited' }));
});

test('after a 409 and a reload, the draft is reported as based on an older version', async () => {
  localStorage.clear();
  let server = { value: { title: 'server', note: 'a' }, version: 'v1' };
  const doc = useDocument<Doc & { note: string }>();
  await doc.open('k', async () => structuredClone(server));
  doc.current!.title = 'mine';
  await flush();
  server = { value: { title: 'server', note: 'b' }, version: 'v2' };
  await doc.save(async () => {
    throw new ApiError(409, 'changed');
  }, 'p');
  await doc.reload();
  assert.deepEqual(doc.draft, { title: 'mine', note: 'a' });
  assert.equal(doc.draftStale, true);
  assert.deepEqual(doc.draftChanges, ['title', 'note']);
});

test('a draft made from the current version is not stale; old plain drafts are read too', async () => {
  localStorage.clear();
  localStorage.setItem(KEY, JSON.stringify(draftOf({ title: 'draft' })));
  const current = useDocument<Doc>();
  await current.open('k', loader({ title: 'server' }));
  assert.deepEqual(current.draft, { title: 'draft' });
  assert.equal(current.draftStale, false);
  const plain = await opened({ title: 'server' }, { title: 'draft' });
  assert.deepEqual(plain.draft, { title: 'draft' });
  assert.equal(plain.draftStale, false);
});

test('a 409 for a slug that already exists is a toast, not the conflict dialog', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); // the toast's 8 s timer
  const doc = await opened({ title: 'server' });
  await doc.save(async () => {
    throw new ApiError(409, 'posts/x already exists — choose another slug', { exists: true });
  }, 'p');
  assert.equal(doc.conflict, false);
});

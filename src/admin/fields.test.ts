import test from 'node:test';
import assert from 'node:assert/strict';
import { getIn, replaceAt, resolveOptions, setIn, type FieldDef } from './fields';

test('getIn/setIn walk dotted paths; empty strings and undefined delete the key', () => {
  const model: Record<string, any> = {};
  setIn(model, 'socials.github', 'https://github.com/x');
  assert.deepEqual(model, { socials: { github: 'https://github.com/x' } });
  assert.equal(getIn(model, 'socials.github'), 'https://github.com/x');
  assert.equal(getIn(model, 'missing.deep'), undefined);
  setIn(model, 'socials.github', '');
  assert.deepEqual(model, { socials: {} });
  setIn(model, 'count', 0);
  setIn(model, 'flag', false);
  assert.deepEqual([getIn(model, 'count'), getIn(model, 'flag')], [0, false]);
  setIn(model, 'count', undefined);
  assert.ok(!('count' in model));
});

test('replaceAt returns a new list', () => {
  const list = ['a', 'b'];
  assert.deepEqual(replaceAt(list, 1, 'c'), ['a', 'c']);
  assert.deepEqual(list, ['a', 'b']);
  assert.deepEqual(replaceAt(undefined, 0, 'x'), []);
});

test('resolveOptions fills option lists, including nested object fields', () => {
  const fields: FieldDef[] = [
    { key: 'topic', label: 'Topic', type: 'select', optionsFrom: 'topics' },
    { key: 'areas', label: 'Areas', type: 'objects', fields: [{ key: 'publications', label: 'P', type: 'pubs', optionsFrom: 'publications' }] },
  ];
  const out = resolveOptions(fields, { topics: [{ value: 'nlp', label: 'NLP' }], publications: [{ value: 'p1', label: 'Paper' }] });
  assert.deepEqual(out[0].options, [{ value: 'nlp', label: 'NLP' }]);
  assert.deepEqual(out[1].fields![0].options, [{ value: 'p1', label: 'Paper' }]);
  assert.equal(fields[0].options, undefined, 'inputs are not mutated');
});

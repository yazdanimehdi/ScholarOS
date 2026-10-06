import test from 'node:test';
import assert from 'node:assert/strict';
import { isOwner, paperLink, shortTitle } from './editorial';

test('paperLink: url, then doi, then arXiv', () => {
  assert.equal(paperLink({ url: 'https://a.org/p', doi: '10.1/x', arxiv: '2401.1' }), 'https://a.org/p');
  assert.equal(paperLink({ doi: '10.1/x', arxiv: '2401.1' }), 'https://doi.org/10.1/x');
  assert.equal(paperLink({ arxiv: '2401.1' }), 'https://arxiv.org/abs/2401.1');
  assert.equal(paperLink({}), undefined);
});

test('paperLink: tolerates pasted URLs and prefixes', () => {
  assert.equal(paperLink({ doi: 'https://doi.org/10.1/x' }), 'https://doi.org/10.1/x');
  assert.equal(paperLink({ doi: 'http://dx.doi.org/10.1/x' }), 'https://doi.org/10.1/x');
  assert.equal(paperLink({ arxiv: 'arXiv:2410.12459' }), 'https://arxiv.org/abs/2410.12459');
  assert.equal(paperLink({ arxiv: 'https://arxiv.org/abs/2410.12459' }), 'https://arxiv.org/abs/2410.12459');
});

test('isOwner: ignores a leading Prof./Dr. and surrounding spaces', () => {
  assert.ok(isOwner('Jane Smith', 'Prof. Jane Smith'));
  assert.ok(isOwner(' Dr Jane Smith ', 'Jane Smith'));
  assert.ok(!isOwner('Jane Smithson', 'Prof. Jane Smith'));
});

test('shortTitle: text before the first colon, else the whole title', () => {
  assert.equal(shortTitle('HELM: Hierarchical Encoding for mRNA'), 'HELM');
  assert.equal(shortTitle('No Colon Here'), 'No Colon Here');
  assert.equal(shortTitle(': Leading colon'), ': Leading colon');
});

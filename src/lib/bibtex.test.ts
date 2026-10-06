import test from 'node:test';
import assert from 'node:assert/strict';
import { bibtexFor, bibtexKey } from './bibtex';

const base = {
  title: 'Adaptive Fine-Tuning for Low-Resource Domains',
  authors: ['Jane Smith', 'Alex Chen'],
  venue: 'EMNLP 2024',
  year: 2024,
};

test('bibtexFor: an explicit bibtex field wins (trimmed)', () => {
  assert.equal(bibtexFor({ ...base, type: 'conference', bibtex: '  @misc{x}\n' }), '@misc{x}');
});

test('bibtexFor: conference and workshop become @inproceedings with booktitle', () => {
  const expected = [
    '@inproceedings{smith2024adaptive,',
    '  title = {Adaptive Fine-Tuning for Low-Resource Domains},',
    '  author = {Jane Smith and Alex Chen},',
    '  booktitle = {EMNLP 2024},',
    '  year = {2024}',
    '}',
  ].join('\n');
  assert.equal(bibtexFor({ ...base, type: 'conference' }), expected);
  assert.match(bibtexFor({ ...base, type: 'workshop' }), /^@inproceedings\{/);
});

test('bibtexFor: other types become @article with journal and a bare doi', () => {
  const bib = bibtexFor({ ...base, type: 'journal', venue: 'TACL', doi: 'https://doi.org/10.1162/tacl_a_00612' });
  assert.match(bib, /^@article\{smith2024adaptive,/);
  assert.match(bib, / {2}journal = \{TACL\},/);
  assert.match(bib, / {2}doi = \{10\.1162\/tacl_a_00612\}\n\}$/);
});

test('bibtexKey: diacritics, "Last, First" names and missing authors', () => {
  assert.equal(bibtexKey({ title: 'Über Graphs', authors: ['María García'], year: 2023 }), 'garcia2023uber');
  assert.equal(bibtexKey({ title: 'A Survey', authors: ['Smith, Jane'], year: 2022 }), 'smith2022a');
  assert.equal(bibtexKey({ title: '— Untitled', authors: [], year: 2021 }), 'anon2021untitled');
});

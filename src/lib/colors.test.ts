import test from 'node:test';
import assert from 'node:assert/strict';
import { editorialAccentCss } from './colors';
import type { SiteConfig } from './types';

const site = (primary?: string) => ({ colors: { light: { primary } } }) as unknown as SiteConfig;

test('editorialAccentCss: nothing when no primary color is set', () => {
  assert.equal(editorialAccentCss(site()), '');
  assert.equal(editorialAccentCss(site('  ')), '');
});

test('editorialAccentCss: accent plus darkened hover from colors.light.primary', () => {
  const css = editorialAccentCss(site('#2c5282'));
  assert.match(css, /html:root\[data-theme='editorial'\] \{/);
  assert.match(css, /--ed-accent: #2c5282;/);
  assert.match(css, /--ed-accent-hover: color-mix\(in oklch, #2c5282, black 25%\);/);
});

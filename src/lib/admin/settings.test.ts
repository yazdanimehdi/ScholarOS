import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isAdminUser, loadAdminSettings } from './settings';

function fixture(site: string, cms: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-settings-'));
  fs.mkdirSync(path.join(root, 'config'));
  fs.writeFileSync(path.join(root, 'config/site.yml'), site);
  fs.writeFileSync(path.join(root, 'config/cms.yml'), cms);
  return root;
}

test('loadAdminSettings reads site.yml and cms.yml', () => {
  const root = fixture(
    "siteMode: personal\nauthor: 'Dr. A'\nlabName: Lab\nadminPath: '/manage/'\nadminUsers: [alice]\n",
    "media_folder: 'src/assets/images'\npublic_folder: '/src/assets/images'\n",
  );
  assert.deepEqual(loadAdminSettings(root), {
    adminPath: 'manage',
    adminUsers: ['alice'],
    mediaFolder: 'src/assets/images',
    publicFolder: '/src/assets/images',
    siteName: 'Dr. A',
  });
});

test('loadAdminSettings defaults: admin path, empty users, lab name in lab mode', () => {
  const s = loadAdminSettings(fixture('siteMode: lab\nauthor: A\nlabName: The Lab\n', 'media_folder: public/uploads\n'));
  assert.equal(s.adminPath, 'admin');
  assert.deepEqual(s.adminUsers, []);
  assert.equal(s.siteName, 'The Lab');
  assert.equal(s.publicFolder, '/public/uploads');
});

test('isAdminUser: usernames or profile URLs, case-insensitive', () => {
  const users = ['JaneSmith', 'https://github.com/alex-chen/', '@maria'];
  assert.ok(isAdminUser('janesmith', users));
  assert.ok(isAdminUser('Alex-Chen', users));
  assert.ok(isAdminUser('maria', users));
  assert.ok(!isAdminUser('jane', users));
  assert.ok(!isAdminUser('', users));
  assert.ok(!isAdminUser('github', ['https://github.com/org/repo']));
});

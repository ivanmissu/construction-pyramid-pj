import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'node:module';

register('./typescript-loader.mjs', import.meta.url);
const { downloadTextFile, copyText } = await import('../src/utils/textDownload.ts');

function browser(t, { writeText, legacyCopy = false, clickError } = {}) {
  const calls = { appended: [], removed: 0, clicked: 0, revoked: [], timers: [], selected: 0 };
  const anchor = {
    href: '', download: '', style: {},
    click() { calls.clicked++; if (clickError) throw clickError; },
    remove() { calls.removed++; },
  };
  const textarea = {
    value: 'print("金字塔")\n',
    focus() {},
    select() { calls.selected++; },
    setSelectionRange() {},
  };
  const globals = {
    document: {
      createElement: () => anchor,
      body: { appendChild: (node) => calls.appended.push(node) },
      execCommand: () => typeof legacyCopy === 'function' ? legacyCopy() : legacyCopy,
    },
    navigator: { clipboard: writeText ? { writeText } : undefined },
    setTimeout: (fn, delay) => { calls.timers.push({ fn, delay }); return 1; },
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  t.mock.method(URL, 'createObjectURL', (blob) => { calls.blob = blob; return 'blob:local-script'; });
  t.mock.method(URL, 'revokeObjectURL', (url) => calls.revoked.push(url));
  return { calls, anchor, textarea };
}

test('downloads the embedded UTF-8 file through a Blob, without a server path', async (t) => {
  const { calls, anchor } = browser(t);
  const code = '# 金字塔\nprint("ready")\n';
  downloadTextFile('khufu.py', code, 'text/x-python;charset=utf-8');
  assert.equal(anchor.href, 'blob:local-script');
  assert.equal(anchor.download, 'khufu.py');
  assert.equal(calls.blob.type, 'text/x-python;charset=utf-8');
  assert.equal(await calls.blob.text(), code);
  assert.deepEqual(calls.appended, [anchor]);
  assert.equal(calls.clicked, 1);
  assert.equal(calls.removed, 1);
  assert.deepEqual(calls.revoked, [], 'the browser must have time to consume the URL');
  assert.ok(calls.timers[0].delay >= 30_000);
  calls.timers[0].fn();
  assert.deepEqual(calls.revoked, ['blob:local-script']);
});

test('download errors are reported to the caller and release their temporary URL', (t) => {
  const { calls } = browser(t, { clickError: new Error('downloads blocked') });
  assert.throws(() => downloadTextFile('README.txt', '说明', 'text/plain;charset=utf-8'), /downloads blocked/);
  assert.equal(calls.removed, 1);
  assert.deepEqual(calls.revoked, ['blob:local-script']);
});

test('copy reports success only after the clipboard API succeeds', async (t) => {
  let written;
  const { textarea, calls } = browser(t, { writeText: async (text) => { written = text; } });
  assert.equal(await copyText(textarea.value, textarea), true);
  assert.equal(written, textarea.value);
  assert.equal(calls.selected, 0);
});

test('copy falls back to selected text when clipboard permission is denied', async (t) => {
  const { textarea, calls } = browser(t, {
    writeText: async () => { throw new Error('permission denied'); }, legacyCopy: true,
  });
  assert.equal(await copyText(textarea.value, textarea), true);
  assert.equal(calls.selected, 1);
});

test('failed legacy copy stays selected for manual copying and never reports success', async (t) => {
  const { textarea, calls } = browser(t);
  assert.equal(await copyText(textarea.value, textarea), false);
  assert.equal(calls.selected, 1);
});

test('unavailable or throwing legacy copy returns a manual-copy result', async (t) => {
  const { textarea } = browser(t, { legacyCopy: () => { throw new Error('unsupported'); } });
  assert.equal(await copyText(textarea.value, textarea), false);
  assert.equal(await copyText(textarea.value, null), false);
});

import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { dismissGuide, watchGuide } from '../entrypoints/sidepanel/guide-preference.ts';

function profile() {
  const values = { 'pki.library': { version: 1 } };
  const listeners = new Set();
  const storage = {
    local: {
      async get(key) { return { [key]: values[key] }; },
      async set(items) {
        Object.assign(values, items);
        for (const [key, newValue] of Object.entries(items)) {
          for (const listener of listeners) listener({ [key]: { newValue } }, 'local');
        }
      },
    },
    onChanged: {
      addListener(listener) { listeners.add(listener); },
      removeListener(listener) { listeners.delete(listener); },
    },
  };
  return { values, storage };
}

test('first use shows the guide and dismissal survives reopening without touching library or AI settings', async () => {
  const { storage, values } = profile();
  const visible = [];
  const close = watchGuide(storage, show => visible.push(show));
  await setImmediate();
  await dismissGuide(storage);
  close();
  const reopen = watchGuide(storage, show => visible.push(show));
  await setImmediate();
  reopen();
  assert.deepEqual(visible, [true, false, false]);
  assert.deepEqual(values, { 'pki.library': { version: 1 }, 'pki.quickStart.dismissed': true });
});

test('dismissal in another panel wins over an older in-flight read', async () => {
  const { storage } = profile();
  const read = Promise.withResolvers();
  storage.local.get = () => read.promise;
  const visible = [];
  const close = watchGuide(storage, show => visible.push(show));
  await dismissGuide(storage);
  read.resolve({});
  await setImmediate();
  close();
  assert.deepEqual(visible, [false]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { readScanSettings, selectAdapter } = createRequire(import.meta.url)('../src/settings.cjs');
const adapters = [{ name: 'en0', address: '10.0.1.69', netmask: '255.255.0.0' },
  { name: 'en1', address: '192.168.1.10', netmask: '255.255.255.0' }];
function mock(values = {}, answer = 'Use Once') {
  const calls = { picks: [], prompts: [], updates: [] };
  const configuration = { get: (key, fallback) => values[key] ?? fallback,
    update: async (...args) => calls.updates.push(args) };
  return { calls, configuration, vscode: {
    ConfigurationTarget: { Global: 1 },
    workspace: { getConfiguration: () => configuration },
    window: {
      showQuickPick: async (items, options) => {
        calls.picks.push(options);
        return items[0].adapter ? items[0] : items.find(item => item.label === answer);
      },
      showInformationMessage: async (...args) => { calls.prompts.push(args); return answer; },
    },
  } };
}

test('duration defaults to five seconds and enabled list filters only scan-all inputs', () => {
  const protocols = [{ id: 'crestron' }, { id: 'future' }];
  const defaults = readScanSettings(mock().configuration, protocols);
  assert.equal(defaults.duration, 5000);
  assert.equal(defaults.enabledDiscoverers.length, 2);
  const configured = readScanSettings(mock({ scanDuration: 2, 'discoverers.crestron.enabled': false }).configuration, protocols);
  assert.equal(configured.duration, 2000);
  assert.deepEqual(configured.enabledDiscoverers, [{ id: 'future' }]);
  for (const scanDuration of [0, 301, 1.5, '5']) {
    assert.throws(() => readScanSettings(mock({ scanDuration }).configuration, protocols), /whole number/);
  }
});

test('valid default skips both picker and confirmation', async () => {
  const { vscode, calls } = mock({ defaultAdapter: 'en0' });
  assert.equal(await selectAdapter(vscode, adapters), adapters[0]);
  assert.equal(calls.picks.length, 0);
  assert.equal(calls.prompts.length, 0);
});

test('saved adapter name survives a change of IPv4 address and netmask', async () => {
  const { vscode, calls } = mock({ defaultAdapter: 'en0' });
  const changed = { ...adapters[0], address: '169.254.0.69', netmask: '255.255.0.0' };
  assert.equal(await selectAdapter(vscode, [changed, adapters[1]]), changed);
  assert.equal(calls.picks.length, 0);
  assert.equal(calls.updates.length, 0);
});

test('default Quick Pick saves only on explicit choice; dismissing cancels selection', async () => {
  for (const answer of ['Use as Default', 'Use Once', undefined]) {
    const { vscode, calls } = mock({}, answer);
    if (answer === undefined) {
      const pick = vscode.window.showQuickPick;
      vscode.window.showQuickPick = (items, options) => items[0].adapter ? pick(items, options) : undefined;
    }
    assert.equal(await selectAdapter(vscode, adapters), answer === undefined ? undefined : adapters[0]);
    assert.deepEqual(calls.updates, answer === 'Use as Default'
      ? [['defaultAdapter', 'en0', 1]] : []);
  }
});

test('unavailable default asks again, preserves old setting for use-once', async () => {
  const { vscode, calls } = mock({ defaultAdapter: 'en9' });
  assert.equal(await selectAdapter(vscode, adapters), adapters[0]);
  assert.match(calls.picks[0].title, /unavailable/);
  assert.deepEqual(calls.updates, []);
});

test('explicit adapter command forces picker, cancellation selects nothing', async () => {
  const { vscode, calls } = mock({ defaultAdapter: 'en0' });
  await selectAdapter(vscode, adapters, { force: true });
  assert.equal(calls.picks.length, 1);
  vscode.window.showQuickPick = async () => undefined;
  assert.equal(await selectAdapter(vscode, adapters, { force: true }), undefined);
  await assert.rejects(selectAdapter(vscode, []), /No local IPv4/);
});

test('every registered discoverer has a settings checkbox', async () => {
  const { discoverers } = await import('../src/registry.mjs');
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  for (const discoverer of discoverers) {
    assert.equal(manifest.contributes.configuration.properties[`deviceDiscovery.discoverers.${discoverer.id}.enabled`].type, 'boolean');
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { scanDiscoverers } from '../src/manager.mjs';
import { discoverers } from '../src/registry.mjs';
import { createRequire } from 'node:module';
const { render } = createRequire(import.meta.url)('../src/table.cjs');

test('all discoverers start concurrently; same IP from different protocols stays separate', async () => {
  const started = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const protocols = ['alpha', 'beta'].map(id => ({ id, name: id, async scan() {
    started.push(id);
    await gate;
    return [{ ip: '10.0.1.3' }];
  } }));
  const pending = scanDiscoverers(protocols, {});
  assert.deepEqual(started, ['alpha', 'beta']);
  release();
  const result = await pending;
  assert.equal(result.devices.length, 2);
  assert.deepEqual(result.devices.map(device => device.discovererId), ['alpha', 'beta']);
  assert.deepEqual(result.errors, []);
});

test('failure keeps partial results and allows other discoverers to complete', async () => {
  const result = await scanDiscoverers([
    { id: 'broken', name: 'Broken', async scan(_, { onDevice }) {
      onDevice([{ ip: '10.0.1.1' }]);
      throw new Error('port occupied');
    } },
    { id: 'working', name: 'Working', async scan() { return [{ ip: '10.0.1.2' }]; } },
  ], {});
  assert.equal(result.devices.length, 2);
  assert.deepEqual(result.errors, [{ discovererId: 'broken', discoverer: 'Broken', message: 'port occupied' }]);
});

test('manager forwards cancellation to every discoverer', async () => {
  const controller = new AbortController();
  const protocols = ['a', 'b'].map(id => ({ id, name: id, scan(_, { signal, duration }) {
    assert.equal(signal, controller.signal);
    assert.equal(duration, 2000);
    return new Promise(resolve => signal.addEventListener('abort', () => resolve([]), { once: true }));
  } }));
  const pending = scanDiscoverers(protocols, {}, { signal: controller.signal, duration: 2000 });
  controller.abort();
  assert.deepEqual(await pending, { devices: [], errors: [] });
});

test('manager deduplicates within a discoverer and rejects missing IP', async () => {
  const result = await scanDiscoverers([{ id: 'test', name: 'Test', async scan() {
    return [{ ip: '10.0.1.2', macAddress: 'AA:BB' }, { ip: '10.0.1.3', macAddress: 'aa:bb' }];
  } }, { id: 'bad', name: 'Bad', async scan() { return [{}]; } }], {});
  assert.equal(result.devices.length, 1);
  assert.equal(result.devices[0].ip, '10.0.1.3');
  assert.match(result.errors[0].message, /without an IP address/);
});

test('per-discoverer options reach only the intended discoverer in combined scans', async () => {
  const protocols = ['crestron', 'mdns'].map(id => ({ id, name: id, async scan(_, options) {
    assert.deepEqual(options.serviceTypes, id === 'mdns' ? ['_http'] : undefined);
    return [];
  } }));
  const result = await scanDiscoverers(protocols, {}, { discovererOptions: { mdns: { serviceTypes: ['_http'] } } });
  assert.deepEqual(result.errors, []);
});

test('summary accepts only required fields; custom tables use registry columns', () => {
  const summary = render([{ ip: '10.0.1.3', discoverer: 'Test' }], 'Done');
  assert.ok(summary.includes('Discoverer'));
  assert.ok(!summary.includes('Serial Number/TSID'));
  assert.ok(summary.includes('Scan for All Devices'));
  const custom = render([{ ip: '10.0.1.3', vendorField: '<unsafe>' }], 'Done', {
    name: 'Future', columns: [['vendorField', 'Custom Field']],
  });
  assert.ok(custom.includes('Custom Field'));
  assert.ok(custom.includes('&lt;unsafe&gt;'));
});

test('registry commands match the extension manifest', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  for (const discoverer of discoverers) assert.ok(manifest.contributes.commands.some(command => command.command === discoverer.command));
});

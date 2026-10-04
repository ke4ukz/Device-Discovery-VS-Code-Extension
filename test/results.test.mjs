import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mergeDevices } = require('../src/results.cjs');
const { render, sortDevices } = require('../src/table.cjs');
const { toCsv } = require('../src/csv.cjs');

test('restart retains absent devices, updates changed IPs in place, and appends new identities', () => {
  const old = [{ discovererId: 'globalCache', identity: 'uuid/1', ip: '10.0.1.20' },
    { discovererId: 'crestron', macAddress: 'AA:BB', ip: '10.0.1.30' }];
  const updated = { discovererId: 'globalCache', identity: 'uuid/1', ip: '10.0.1.21', revision: 'new' };
  const added = { discovererId: 'globalCache', identity: 'uuid/2', ip: '10.0.1.2' };
  assert.deepEqual(mergeDevices(old, [added, updated]), [updated, old[1], added]);
  assert.deepEqual(old[0].ip, '10.0.1.20');
  assert.deepEqual(mergeDevices(old, []), old);
});

test('repeated live snapshots retain insertion order and separate discoverers and services', () => {
  const a = { discovererId: 'mdns', identity: 'http', ip: '10.0.1.2' };
  const b = { discovererId: 'mdns', identity: 'ssh', ip: '10.0.1.2' };
  const c = { discovererId: 'other', identity: 'http', ip: '10.0.1.2' };
  let devices = mergeDevices([], [a, b]);
  devices = mergeDevices(devices, [c, b, a]);
  assert.deepEqual(devices, [a, b, c]);
  const mac = { discovererId: 'crestron', macAddress: 'aa:bb', ip: '10.0.1.5' };
  assert.deepEqual(mergeDevices([{ ...mac, macAddress: 'AA:BB', ip: '10.0.1.4' }], [mac]), [mac]);
});

test('restarted table and CSV preserve appended rows, while normal scans retain IP sorting', () => {
  const devices = [{ ip: '10.0.1.20' }, { ip: '10.0.1.2' }];
  assert.deepEqual(sortDevices(devices).map(device => device.ip), ['10.0.1.2', '10.0.1.20']);
  const html = render(devices, 'Done', undefined, { preserveOrder: true, running: false });
  assert.ok(html.indexOf('<td>10.0.1.20</td>') < html.indexOf('<td>10.0.1.2</td>'));
  const csv = toCsv(devices, undefined, { preserveOrder: true });
  assert.ok(csv.indexOf('"10.0.1.20"') < csv.indexOf('"10.0.1.2"'));
});

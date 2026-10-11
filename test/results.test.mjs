import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mergeDevices } = require('../src/results.cjs');
const { render, sortDevices, formatLastSeen } = require('../src/table.cjs');
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

test('last seen is included in summary, detailed results, and CSV exports', () => {
  const lastSeen = '2026-10-10T12:34:56.789Z';
  const devices = [{ ip: '10.0.1.2', lastSeen }];
  for (const discoverer of [undefined, { name: 'Custom', columns: [['ip', 'IP Address']] }]) {
    const html = render(devices, 'Done', discoverer);
    assert.ok(html.includes('<th scope="col">Last Seen</th>'));
    assert.ok(html.includes(`datetime="${lastSeen}" title="${lastSeen}"`));
    assert.ok(toCsv(devices, discoverer).includes(`"${lastSeen}"`));
  }
  assert.equal(mergeDevices(devices, [])[0].lastSeen, lastSeen);
});

test('last seen uses relative times through 24 hours and a local date afterward', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const ago = milliseconds => new Date(now - milliseconds).toISOString();
  for (const [age, expected] of [
    [0, 'a few seconds ago'], [59000, 'a few seconds ago'],
    [60000, '1 minute ago'], [120000, '2 minutes ago'],
    [3599000, '59 minutes ago'], [3600000, '1 hour ago'],
    [14400000, '4 hours ago'], [86400000, '24 hours ago'],
  ]) assert.equal(formatLastSeen(ago(age), now), expected);
  const old = ago(86400001);
  assert.equal(formatLastSeen(old, now), new Date(old).toLocaleString());
  assert.equal(formatLastSeen(ago(-1000), now), 'a few seconds ago');
  assert.equal(formatLastSeen(undefined, now), '—');
  assert.equal(formatLastSeen('invalid', now), '—');
});

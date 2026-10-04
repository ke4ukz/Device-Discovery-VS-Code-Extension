import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { parseBeacon } from '../src/amx-protocol.mjs';
import { scanBeacons, globalCache, amx } from '../src/discoverers/amx.mjs';
import { scanDiscoverers } from '../src/manager.mjs';

const gc = 'AMXB<-UUID=GlobalCache_000C1E123456><-Make=Global Caché><-Model=iTach><-Revision=1.0><-Config-URL=http://10.0.1.2>';
const other = 'AMXB<Device-UUID=projector-123><Device-Make=Example><Device-Model=Projector><Device-Revision=2.0>';
const parse = text => parseBeacon(Buffer.from(text), '10.0.1.2');

class Socket extends EventEmitter {
  bind(port, host, callback) { assert.equal(port, 9131); assert.equal(host, '0.0.0.0'); callback(); }
  addMembership(group, address) { assert.equal(group, '239.255.250.250'); assert.equal(address, '10.0.1.69'); }
  close() { this.closed = true; }
}
const adapter = { name: 'en0', address: '10.0.1.69' };

test('parses Global Caché and Device-prefixed fields while retaining raw details', () => {
  const device = parse(gc);
  assert.equal(device.globalCache, true);
  assert.equal(device.macAddress, '00:0C:1E:12:34:56');
  assert.equal(device.configUrl, 'http://10.0.1.2');
  assert.equal(device.details, gc);
  assert.equal(parse(other).manufacturer, 'Example');
  assert.equal(parse(other).globalCache, false);
  assert.equal(parse(other).macAddress, undefined);
  assert.equal(parse('garbage'), null);
  assert.equal(parse('AMXB<broken>'), null);
});

test('recognizes UUID variants and preserves module and optional information', () => {
  assert.equal(parse('AMXB<-UUID=000C1E123456_GlobalCache>').globalCache, true);
  assert.equal(parse('AMXB<Device-UUID=00:0c:1e:12:34:56>').macAddress, '00:0C:1E:12:34:56');
  const a = parse(gc + '<-Mod_Addr=1><-SN=123><-SDKClass=Control><-Status=Ready>');
  const b = parse(gc + '<-Mod_Addr=2>');
  assert.notEqual(a.identity, b.identity);
  assert.equal(a.serialNumber, '123');
  assert.equal(a.sdkClass, 'Control');
  assert.equal(a.deviceStatus, 'Ready');
});

test('combined scan uses one listener, routes categories, deduplicates, and closes on cancellation', async () => {
  const socket = new Socket(), controller = new AbortController();
  let calls = 0;
  const sharedScan = { name: 'Shared', scan: (adapter, options) => {
    calls++;
    return scanBeacons(adapter, { ...options, createSocket: () => socket });
  } };
  const protocols = [globalCache, amx].map(protocol => ({ ...protocol, sharedScan }));
  const pending = scanDiscoverers(protocols, adapter, { duration: 0, signal: controller.signal });
  for (const beacon of [gc, other, gc]) socket.emit('message', Buffer.from(beacon), { address: '10.0.1.2' });
  controller.abort();
  const result = await pending;
  assert.equal(calls, 1);
  assert.equal(result.devices.length, 2);
  assert.deepEqual(result.devices.map(device => device.discovererId), ['globalCache', 'amx']);
  assert.deepEqual(result.errors, []);
  assert.equal(socket.closed, true);
});

test('single selected category excludes other manufacturers', async () => {
  const sharedScan = { name: 'Shared', async scan() { return [parse(gc), parse(other)]; } };
  for (const protocol of [globalCache, amx]) {
    const result = await scanDiscoverers([{ ...protocol, sharedScan }], adapter);
    assert.equal(result.devices.length, 1);
    assert.equal(result.devices[0].discovererId, protocol.id);
  }
});

test('timer and membership failure clean up sockets', async () => {
  const socket = new Socket();
  assert.deepEqual(await scanBeacons(adapter, { duration: 1, createSocket: () => socket }), []);
  assert.equal(socket.closed, true);
  const failed = new Socket();
  failed.addMembership = () => { throw new Error('membership failed'); };
  await assert.rejects(scanBeacons(adapter, { createSocket: () => failed }), /membership failed/);
  assert.equal(failed.closed, true);
});

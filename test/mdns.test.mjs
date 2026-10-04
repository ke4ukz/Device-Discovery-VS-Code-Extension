import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { query, decode, ServiceCache } from '../src/mdns-protocol.mjs';
import { scan, mdns, matchesServiceType } from '../src/discoverers/mdns.mjs';
import { scanDiscoverers } from '../src/manager.mjs';

const name = value => query([{ name: value, type: 12 }]).subarray(12, -4);
function record(owner, type, data, ttl = 120, flush = false) {
  const header = Buffer.alloc(10);
  header.writeUInt16BE(type);
  header.writeUInt16BE(flush ? 0x8001 : 1, 2);
  header.writeUInt32BE(ttl, 4);
  header.writeUInt16BE(data.length, 8);
  return Buffer.concat([name(owner), header, data]);
}
function response(records) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(records.length, 6);
  return Buffer.concat([header, ...records]);
}
const type = '_http._tcp.local.';
const instance = `Test Web.${type}`;
const host = 'test-host.local.';
const srv = Buffer.concat([Buffer.from([0, 0, 0, 0, 0x1f, 0x90]), name(host)]);
const ptrPacket = response([record(type, 12, name(instance))]);
const detailPacket = response([record(instance, 33, srv),
  record(instance, 16, Buffer.from([6, ...Buffer.from('path=/')])),
  record(host, 1, Buffer.from([10, 0, 1, 20]), 120, true)]);

test('query encodes PTR multicast questions and response parser resolves service records', () => {
  const bytes = query([{ name: type, type: 12 }]);
  assert.equal(bytes.readUInt16BE(4), 1);
  assert.equal(bytes.readUInt16BE(bytes.length - 2), 1);
  assert.deepEqual(decode(bytes), []);
  const cache = new ServiceCache();
  cache.ingest(decode(detailPacket));
  assert.equal(cache.devices().length, 0);
  cache.ingest(decode(ptrPacket));
  const [device] = cache.devices();
  assert.equal(device.serviceName, 'Test Web');
  assert.equal(device.serviceType, '_http._tcp.local');
  assert.equal(device.hostname, 'test-host.local');
  assert.equal(device.ip, '10.0.1.20');
  assert.equal(device.port, 8080);
  assert.equal(device.txtRecords, 'path=/');
});

test('DNS compression works; truncated packets and pointer loops are rejected', () => {
  const header = Buffer.alloc(12); header.writeUInt16BE(0x8400, 2); header.writeUInt16BE(2, 6);
  const first = record(host, 1, Buffer.from([10, 0, 1, 20]));
  const rrHeader = Buffer.alloc(10); rrHeader.writeUInt16BE(1); rrHeader.writeUInt16BE(1, 2);
  rrHeader.writeUInt32BE(120, 4); rrHeader.writeUInt16BE(4, 8);
  const compressed = Buffer.concat([header, first, Buffer.from([0xc0, 12]), rrHeader, Buffer.from([10, 0, 1, 21])]);
  assert.equal(decode(compressed)[1].name, host);
  assert.throws(() => decode(compressed.subarray(0, -1)), /Truncated/);
  const loop = Buffer.concat([header, Buffer.from([0xc0, 12]), rrHeader, Buffer.from([10, 0, 1, 21])]);
  assert.throws(() => decode(loop), /pointer loop/);
});

test('cache preserves multiple addresses, removes goodbye records, and expires TTLs', () => {
  const cache = new ServiceCache();
  cache.ingest([...decode(ptrPacket), ...decode(detailPacket),
    { name: host, type: 1, ttl: 120, flush: true, address: '10.0.1.21' }]);
  assert.equal(cache.devices().length, 2);
  cache.ingest([{ name: host, type: 1, ttl: 0, address: '10.0.1.20' }]);
  assert.equal(cache.devices().length, 1);
  cache.ingest([], Date.now() + 121000);
  assert.equal(cache.records.size, 0);
});

class FakeSocket extends EventEmitter {
  sends = [];
  closeCount = 0;
  bind(port, address, callback) { this.binding = { port, address }; queueMicrotask(callback); }
  addMembership(...args) { this.membership = args; }
  setMulticastInterface(value) { this.adapter = value; }
  setMulticastTTL(value) { this.ttl = value; }
  setMulticastLoopback() {}
  send(bytes, port, address, callback) { this.sends.push({ bytes, port, address }); callback(); }
  close() { this.closeCount++; }
}
const adapter = { name: 'test0', address: '10.0.1.69', netmask: '255.255.0.0' };

test('service filters match exact short names or specific full types', () => {
  assert.ok(matchesServiceType('_http._tcp.local', []));
  assert.ok(matchesServiceType('_http._udp.local.', ['_HTTP']));
  assert.ok(matchesServiceType('_ssh._tcp.local', ['_http', '_ssh']));
  assert.ok(matchesServiceType('_http._tcp.local', ['_http._tcp.local.']));
  assert.ok(matchesServiceType('_http._tcp.local', ['_http._tcp']));
  assert.ok(!matchesServiceType('_https._tcp.local', ['_http']));
  assert.ok(!matchesServiceType('_http._udp.local', ['_http._tcp.local']));
});

test('service filtering applies to both live updates and final results', async () => {
  for (const filter of ['_http', '_ssh']) {
    const socket = new FakeSocket(), controller = new AbortController();
    const updates = [];
    const promise = scan(adapter, { serviceTypes: [filter], signal: controller.signal,
      createSocket: () => socket, onDevice: devices => updates.push(devices) });
    await new Promise(resolve => setImmediate(resolve));
    socket.emit('message', ptrPacket);
    socket.emit('message', detailPacket);
    controller.abort();
    const expected = filter === '_http' ? 1 : 0;
    assert.equal((await promise).length, expected);
    assert.equal(updates.at(-1).length, expected);
    assert.ok(socket.sends[0].bytes.includes(Buffer.from(filter)));
  }
});

test('mDNS binds shared port, browses types, resolves split packets, and cancels cleanly', async () => {
  const socket = new FakeSocket(), controller = new AbortController();
  const promise = scan(adapter, { signal: controller.signal, createSocket: () => socket });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(socket.binding, { port: 5353, address: '0.0.0.0' });
  assert.deepEqual(socket.membership, ['224.0.0.251', adapter.address]);
  assert.equal(socket.adapter, adapter.address);
  assert.equal(socket.ttl, 255);
  const initialCount = socket.sends.length;
  socket.emit('message', ptrPacket);
  assert.ok(socket.sends.length > initialCount);
  socket.emit('message', detailPacket);
  socket.emit('message', Buffer.alloc(3)); // Malformed traffic cannot end the scan.
  controller.abort();
  assert.equal((await promise).length, 1);
  assert.equal(socket.closeCount, 1);
});

test('mDNS socket failures reject and close; completed scans close without cancellation', async () => {
  const failed = new FakeSocket();
  failed.addMembership = () => { throw new Error('membership failed'); };
  await assert.rejects(scan(adapter, { createSocket: () => failed }), /membership failed/);
  assert.equal(failed.closeCount, 1);
  const completed = new FakeSocket();
  assert.deepEqual(await scan(adapter, { createSocket: () => completed, duration: 5 }), []);
  assert.equal(completed.closeCount, 1);
});

test('manager preserves multiple service instances at the same host/IP', async () => {
  const result = await scanDiscoverers([{ ...mdns, async scan() {
    return [{ ip: '10.0.1.20', hostname: host, identity: 'service-a' },
      { ip: '10.0.1.20', hostname: host, identity: 'service-b' }];
  } }], adapter);
  assert.equal(result.devices.length, 2);
  assert.equal(result.devices[0].discoverer, 'mDNS');
});

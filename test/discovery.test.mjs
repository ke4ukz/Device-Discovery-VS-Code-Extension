import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { parseResponse } from '../src/discoverers/crestron-protocol.mjs';
import { scan, crestron } from '../src/discoverers/crestron.mjs';
const { render } = createRequire(import.meta.url)('../src/table.cjs');

function packet(headerByte = 1, prefix = '#', details) {
  const bytes = Buffer.alloc(394);
  Buffer.from([0x15, 0, 0, 0, 1, 0x84, 0, headerByte, 0, 0]).copy(bytes);
  bytes.write('TEST-HOST', 10);
  bytes.write(details ?? `TEST-MODEL [v1.2.3 (Tue Jun  4 16:32:15 EDT 2024), ${prefix}12345678] @E-001122334455`, 266);
  return bytes;
}
class FakeSocket extends EventEmitter {
  sends = [];
  closeCount = 0;
  bind(port, address, callback) { this.binding = { port, address }; queueMicrotask(callback); }
  setBroadcast(value) { this.broadcast = value; }
  send(bytes, port, target, callback) { this.sends.push({ bytes, port, target }); callback(this.sendError); }
  close() { this.closeCount++; }
}
const adapter = { name: 'test0', address: '10.0.1.69', netmask: '255.255.0.0' };

test('both observed headers and all serial/TSID prefixes decode', () => {
  for (const header of [0, 1]) for (const prefix of ['#', '%', '$']) {
    const device = parseResponse(packet(header, prefix));
    assert.equal(device.hostname, 'TEST-HOST');
    assert.equal(device.model, 'TEST-MODEL');
    assert.equal(device.firmwareVersion, '1.2.3');
    assert.equal(device.serialNumberOrTsid, `${prefix}12345678`);
    assert.equal(device.macAddress, '00:11:22:33:44:55');
    assert.equal(device.firmwareBuildDate, 'Tue Jun  4 16:32:15 EDT 2024');
  }
});

test('invalid packets are rejected; unfamiliar and unterminated details survive', () => {
  assert.equal(parseResponse(packet().subarray(0, 300)), null);
  assert.equal(parseResponse(packet(2)), null);
  const unknown = parseResponse(packet(1, '#', 'unknown format'));
  assert.equal(unknown.details, 'unknown format');
  assert.equal(unknown.model, undefined);
  const bytes = packet();
  bytes.fill(65, 266);
  assert.equal(parseResponse(bytes).details.length, 128);
});

test('scan uses adapter broadcasts and merges changing IP/source ports by MAC', async () => {
  const socket = new FakeSocket();
  const updates = [];
  const promise = scan(adapter, { createSocket: () => socket, duration: 20,
    onDevice: devices => updates.push(devices) });
  await new Promise(resolve => setImmediate(resolve));
  socket.emit('message', packet(), { address: '169.254.1.2', port: 41794 });
  socket.emit('message', packet(0), { address: '10.0.1.15', port: 55000 });
  socket.emit('message', Buffer.alloc(10), { address: '10.0.1.99' });
  const result = await promise;
  assert.equal(result.length, 1);
  assert.equal(result[0].ip, '10.0.1.15');
  assert.equal(updates.length, 2);
  assert.deepEqual(socket.binding, { port: 41794, address: adapter.address });
  assert.deepEqual(socket.sends.map(send => send.target), ['255.255.255.255', '10.0.255.255']);
  assert.equal(socket.sends[0].bytes.length, 266);
  assert.equal(socket.sends[0].bytes.subarray(0, 10).toString('hex'), '14000000010400030000');
  assert.equal(socket.closeCount, 1);
});

test('cancellation closes sockets and returns partial results', async () => {
  const socket = new FakeSocket();
  const controller = new AbortController();
  const promise = scan(adapter, { createSocket: () => socket, signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  socket.emit('message', packet(), { address: '10.0.1.3' });
  controller.abort();
  assert.equal((await promise).length, 1);
  assert.equal(socket.closeCount, 1);
});

test('socket and send failures reject scans and close once', async () => {
  for (const mode of ['bind', 'send']) {
    const socket = new FakeSocket();
    const error = new Error('test network failure');
    if (mode === 'send') socket.sendError = error;
    else socket.bind = () => queueMicrotask(() => socket.emit('error', error));
    await assert.rejects(scan(adapter, { createSocket: () => socket }), /test network failure/);
    assert.equal(socket.closeCount, 1);
  }
});

test('table treats device fields and status as text', () => {
  const html = render([{ hostname: '<script>alert(1)</script>', ip: '10.0.1.3', details: '<img src=x>' }], '<unsafe>', crestron);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;unsafe&gt;'));
  assert.ok(html.includes('Serial Number/TSID'));
});

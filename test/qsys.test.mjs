import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { parseQdp } from '../src/qsys-protocol.mjs';
import { scan, qsys } from '../src/discoverers/qsys.mjs';
import { scanDiscoverers } from '../src/manager.mjs';

const device = '<device><ref>device.core.test</ref><name>Room &amp; Hall</name><type>core</type><part_number>Core Nano</part_number><lan_a_ip>10.0.1.2</lan_a_ip><lan_a_mac>00:11:22:33:44:55</lan_a_mac><lan_b_ip>10.0.2.2</lan_b_ip></device>';
const control = '<control><ref>control.design.core.primary</ref><device_ref>device.core.test</device_ref><design_pretty><![CDATA[Main <Design>]]></design_pretty><redundant>1</redundant><primary>1</primary></control>';
const packet = text => Buffer.from(`<QDP>${text}</QDP>`);
const pair = socket => {
  const listener = new Socket();
  let calls = 0;
  return { listener, createSocket: () => calls++ === 0 ? socket : listener };
};
const adapter = { name: 'test0', address: '10.0.1.69' };
class Socket extends EventEmitter {
  sends = [];
  closeCount = 0;
  bind(port, address, callback) { this.binding = { port, address }; callback(); }
  addMembership(group, address) { this.membership = { group, address }; }
  setMulticastInterface(address) { this.interface = address; }
  send(bytes, port, target, callback) { this.sends.push({ text: bytes.toString(), port, target }); callback(this.sendError); }
  close() { this.closeCount++; }
}

test('QDP parses multiple records, XML declaration, entities, CDATA and empty fields', () => {
  const records = parseQdp(Buffer.from(`<?xml version="1.0"?><QDP>${device}${control}<device><ref>other</ref><name/></device></QDP>`));
  assert.equal(records.length, 3);
  assert.equal(records[0].fields.name, 'Room & Hall');
  assert.equal(records[1].fields.design_pretty, 'Main <Design>');
  assert.equal(records[2].fields.name, '');
  for (const xml of ['garbage', '<QDP><device></QDP>', '<other/>', '<QDP/>trailing', '<QDP><',
    '<!DOCTYPE QDP [<!ENTITY x SYSTEM "file:///etc/passwd">]><QDP/>',
    '<QDP><device><ref>&unknown;</ref></device></QDP>']) assert.equal(parseQdp(Buffer.from(xml)), null);
  assert.deepEqual(parseQdp(packet('<device/><control/><unknown/>')), []);
});

test('queries both ports and record types; merges either arrival order and deduplicates LAN rows', async () => {
  for (const replies of [[device, control], [control, device], [device + control]]) {
    const socket = new Socket(), controller = new AbortController(), updates = [];
    const { listener, createSocket } = pair(socket);
    const pending = scanDiscoverers([qsys], adapter, { signal: controller.signal, duration: 0,
      discovererOptions: { qsys: { createSocket } }, onDevice: rows => updates.push(rows) });
    assert.deepEqual(socket.binding, { port: 0, address: adapter.address });
    assert.equal(socket.interface, adapter.address);
    assert.deepEqual(listener.binding, { port: 2467, address: '0.0.0.0' });
    assert.deepEqual(listener.membership, { group: '224.0.23.175', address: adapter.address });
    assert.deepEqual(socket.sends.map(send => [send.port, send.text]), [2467, 2468].flatMap(port =>
      ['device.*', 'control.*', 'device.ioframe.*'].map(ref => [port, `<QDP><query_ref>${ref}</query_ref></QDP>`])));
    assert.ok(socket.sends.every(send => send.target === '224.0.23.175'));
    for (const reply of [...replies, device]) socket.emit('message', packet(reply), { address: '10.0.1.2', port: 6504 });
    controller.abort();
    const { devices, errors } = await pending;
    assert.deepEqual(errors, []);
    assert.equal(devices.length, 2);
    assert.deepEqual(devices.map(row => row.lan), ['A', 'B']);
    assert.ok(devices.every(row => row.designName === 'Main <Design>' && row.redundancy === 'Primary'));
    assert.equal(devices[0].hostname, 'Room & Hall');
    assert.equal(devices[0].discovererId, 'qsys');
    assert.ok(Number.isFinite(Date.parse(devices[0].lastSeen)));
    assert.match(devices[0].details, /<control>/);
    assert.equal(updates.at(-1).length, 2);
    assert.equal(socket.closeCount, 1);
    assert.equal(listener.closeCount, 1);
  }
});

test('missing LAN addresses fall back to sender; late controls update design and backup role', async () => {
  const socket = new Socket(), controller = new AbortController();
  const pending = scan(adapter, { createSocket: pair(socket).createSocket, duration: 0, signal: controller.signal });
  socket.emit('message', packet('<device><ref>device.core.test</ref><type>core</type><lan_a_ip>invalid</lan_a_ip></device>'), { address: '10.0.1.3' });
  socket.emit('message', packet(control.replace('<primary>1', '<primary>0')), { address: '10.0.1.3' });
  socket.emit('message', Buffer.from('broken'), { address: '10.0.1.4' });
  controller.abort();
  const [row] = await pending;
  assert.equal(row.ip, '10.0.1.3');
  assert.equal(row.model, 'core');
  assert.equal(row.redundancy, 'Backup');
});

test('timeout, cancellation before bind, and socket failures clean up', async () => {
  const socket = new Socket();
  assert.deepEqual(await scan(adapter, { duration: 1, createSocket: pair(socket).createSocket }), []);
  assert.equal(socket.closeCount, 1);
  const controller = new AbortController(); controller.abort();
  assert.deepEqual(await scan(adapter, { signal: controller.signal, createSocket: () => { throw new Error('unexpected'); } }), []);
  for (const mode of ['bind', 'send', 'interface', 'socket']) {
    const failed = new Socket(), error = new Error('network failure');
    if (mode === 'bind') failed.bind = () => { throw error; };
    if (mode === 'send') failed.sendError = error;
    if (mode === 'interface') failed.setMulticastInterface = () => { throw error; };
    if (mode === 'socket') failed.bind = () => queueMicrotask(() => failed.emit('error', error));
    await assert.rejects(scan(adapter, { createSocket: pair(failed).createSocket }), /network failure/);
    assert.equal(failed.closeCount, 1);
  }
});

// Sanitized from the TSC-70-G3 multicast announcement in the user's capture.
const panel = `<QDP><device>
    <type>ioframe</type><name>test-panel</name><part_number>TSC-70-G3</part_number>
    <platform>tsc_g3</platform><aux_a_ip></aux_a_ip><aux_b_ip></aux_b_ip>
    <lan_a_ip>192.0.2.3</lan_a_ip><lan_b_ip></lan_b_ip>
    <lan_a_lldp></lan_a_lldp><lan_b_lldp></lan_b_lldp>
    <ref>device.ioframe.test-panel</ref><is_virtual>false</is_virtual>
    <periph_cfg_url>/#network</periph_cfg_url>
</device>
</QDP>`;

test('captured touch-panel announcements arrive via multicast and deduplicate with unicast replies', async () => {
  const socket = new Socket(), { listener, createSocket } = pair(socket);
  const controller = new AbortController(), updates = [];
  const pending = scan(adapter, { createSocket, signal: controller.signal, duration: 0,
    onDevice: rows => updates.push(rows) });
  const bytes = Buffer.from(panel), sender = { address: '192.0.2.3', port: 6504 };
  listener.emit('message', bytes, sender);
  socket.emit('message', bytes, sender);
  listener.emit('message', bytes, sender);
  controller.abort();
  const rows = await pending;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].model, 'TSC-70-G3');
  assert.equal(rows[0].ip, '192.0.2.3');
  assert.equal(rows[0].macAddress, '');
  assert.equal(rows[0].lan, 'A');
  assert.equal(rows[0].details, panel);
  assert.equal(updates.length, 3);
  assert.equal(socket.closeCount, 1);
  assert.equal(listener.closeCount, 1);
});

test('multicast bind and membership failures close both sockets', async () => {
  for (const mode of ['bind', 'membership']) {
    const socket = new Socket(), { listener, createSocket } = pair(socket);
    if (mode === 'bind') listener.bind = () => { throw new Error('listener failure'); };
    else listener.addMembership = () => { throw new Error('listener failure'); };
    await assert.rejects(scan(adapter, { createSocket }), /listener failure/);
    assert.equal(socket.closeCount, 1);
    assert.equal(listener.closeCount, 1);
  }
});

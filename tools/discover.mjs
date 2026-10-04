import dgram from 'node:dgram';
import os from 'node:os';
import { isIP } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseResponse } from '../src/discoverers/crestron-protocol.mjs';

// IPv6 mode is an experimental transport test, not a verified Crestron protocol.
const ipv6 = process.argv[2] === '--ipv6';
const interfaceName = ipv6 ? (process.argv[3] ?? 'en0') : null;
const interfaces = os.networkInterfaces();
const localAddress = ipv6
  ? interfaces[interfaceName]?.find(address => address.family === 'IPv6' && address.address.startsWith('fe80:'))?.address
  : (process.argv[2] ?? '10.0.1.69');
const target = process.argv[ipv6 ? 4 : 3];
if (target) {
  const [address, zone, ...extra] = target.split('%');
  if (isIP(address) !== (ipv6 ? 6 : 4) || extra.length ||
      (zone !== undefined && (!ipv6 || zone !== interfaceName))) {
    console.error(ipv6
      ? `Invalid IPv6 target: ${target}. Use an actual device address from ping6/ndp on ${interfaceName}, or omit the target for multicast.`
      : `Invalid IPv4 target: ${target}. Use an actual device IPv4 address.`);
    process.exit(1);
  }
}
const adapter = Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
  addresses.map(address => ({ name, ...address }))
).find(address => address.family === (ipv6 ? 'IPv6' : 'IPv4') && address.address === localAddress);
if (!adapter) throw new Error(`No local adapter has address ${localAddress}`);
const broadcast = ipv6 ? null : localAddress.split('.').map((byte, index) =>
  Number(byte) | (255 ^ Number(adapter.netmask.split('.')[index]))).join('.');
const scoped = address => address.includes('%') ? address : `${address}%${adapter.name}`;
const destinations = ipv6
  ? [target ? scoped(target) : `ff02::1%${adapter.name}`]
  : [...new Set(['255.255.255.255', broadcast, target].filter(Boolean))];
const query = Buffer.alloc(266);
Buffer.from([0x14, 0, 0, 0, 1, 4, 0, 3, 0, 0]).copy(query);
Buffer.from(os.hostname(), 'ascii').copy(query, 10, 0, 255);
const socket = dgram.createSocket(ipv6 ? 'udp6' : 'udp4');
const captures = [];
let interval;
let timeout;
let finishing = false;

async function finish() {
  if (finishing) return;
  finishing = true;
  clearInterval(interval);
  clearTimeout(timeout);
  socket.close();
  await mkdir('captures', { recursive: true });
  const path = `captures/discovery-${new Date().toISOString().replaceAll(':', '-')}.json`;
  await writeFile(path, JSON.stringify({ localAddress, transport: ipv6 ? 'IPv6' : 'IPv4', adapter: adapter.name,
    destinations, captures }, null, 2) + '\n');
  console.log(`Saved ${captures.length} packets to ${path}`);
}

socket.on('error', error => {
  console.error(`UDP error: ${error.message}`);
  process.exitCode = 1;
  finish().catch(error => console.error(error));
});
socket.on('message', (data, sender) => {
  // Ignore our own broadcast query, but preserve unexpected response formats.
  if (data.equals(query)) return;
  const parsed = parseResponse(data);
  const record = { receivedAt: new Date().toISOString(), ip: sender.address,
    port: sender.port, length: data.length, validHeader: parsed !== null,
    hostname: null, details: null, ...parsed,
    hex: data.toString('hex') };
  captures.push(record);
  console.log(JSON.stringify({ ...record, hex: undefined }, null, 2));
});
socket.bind(41794, ipv6 ? scoped(localAddress) : localAddress, () => {
  if (ipv6) socket.setMulticastTTL(1);
  else socket.setBroadcast(true);
  console.log(`Scanning via ${adapter.name} (${localAddress}/${adapter.netmask}) for 12 seconds`);
  const send = () => destinations.forEach(address => {
    console.log(`Query -> ${address}:41794`);
    socket.send(query, 41794, address, error => {
      if (error) console.error(`Send to ${address}: ${error.message}`);
    });
  });
  send();
  interval = setInterval(send, 5000);
  timeout = setTimeout(() => finish().catch(error => {
    console.error(error);
    process.exitCode = 1;
  }), 12000);
});
process.on('SIGINT', () => finish().catch(error => console.error(error)));

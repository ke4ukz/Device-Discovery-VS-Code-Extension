import { readFile } from 'node:fs/promises';
import { parseResponse } from '../src/discoverers/crestron-protocol.mjs';

if (!process.argv[2]) throw new Error('Usage: node tools/replay.mjs captures/discovery-....json');
const capture = JSON.parse(await readFile(process.argv[2], 'utf8'));
const devices = new Map();
for (const packet of capture.captures) {
  const parsed = parseResponse(Buffer.from(packet.hex, 'hex'));
  if (parsed) devices.set(`${packet.ip}/${parsed.macAddress ?? parsed.hostname}`, { ip: packet.ip, ...parsed });
}
console.log(JSON.stringify([...devices.values()], null, 2));

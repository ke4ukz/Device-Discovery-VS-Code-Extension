import { crestron } from './discoverers/crestron.mjs';
import { mdns } from './discoverers/mdns.mjs';

// Add each discoverer here; the extension registers its command and detailed table.
export const discoverers = [crestron, mdns];

export function normalizeDevice(discoverer, device) {
  if (!device || typeof device.ip !== 'string' || !device.ip) {
    throw new Error(`${discoverer.name} returned a device without an IP address`);
  }
  return { ...device, discovererId: discoverer.id, discoverer: discoverer.name };
}

export function importCapture(capture) {
  if (!Array.isArray(capture.captures)) throw new Error('The file is not a discovery capture.');
  const discoverer = discoverers.find(item => item.id === (capture.discovererId ?? 'crestron'));
  if (!discoverer?.parseCapture) throw new Error('No capture parser is registered for this discoverer.');
  const devices = new Map();
  for (const packet of capture.captures) {
    if (typeof packet.hex !== 'string' || typeof packet.ip !== 'string') continue;
    const parsed = discoverer.parseCapture(packet);
    if (parsed) devices.set(parsed.macAddress ?? `${packet.ip}/${parsed.hostname}`,
      normalizeDevice(discoverer, { ...parsed, ip: packet.ip }));
  }
  return { discoverer, devices: [...devices.values()] };
}

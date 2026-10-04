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

import { normalizeDevice } from './registry.mjs';

// Each discoverer owns its sockets/timers. A failed discoverer leaves others running.
export async function scanDiscoverers(discoverers, adapter, {
  signal, duration = 5000, onDevice = () => {}, log = () => {}, discovererOptions = {},
} = {}) {
  const results = new Map();
  const errors = [];
  const snapshot = () => [...results.values()].flat();
  const groups = new Map();
  for (const discoverer of discoverers) {
    const key = discoverer.sharedScan ?? discoverer;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(discoverer);
  }
  await Promise.all([...groups].map(async ([transport, members]) => {
    const discoverer = members[0];
    const update = devices => {
      for (const discoverer of members) {
        const selected = discoverer.accepts ? devices.filter(discoverer.accepts) : devices;
        const normalized = selected.map(device => normalizeDevice(discoverer, device));
        const unique = new Map(normalized.map(device => [
          device.identity ?? device.macAddress?.toUpperCase() ?? `${device.ip}/${device.hostname ?? ''}`, device,
        ]));
        results.set(discoverer.id, [...unique.values()]);
      }
      onDevice(snapshot());
    };
    try {
      update(await transport.scan(adapter, { ...discovererOptions[discoverer.id], signal, duration, onDevice: update,
        log: message => log(`[${transport.name}] ${message}`) }));
    } catch (error) {
      for (const discoverer of members) errors.push({ discovererId: discoverer.id, discoverer: discoverer.name, message: error.message });
      log(`[${transport.name}] Scan failed: ${error.message}`);
    }
  }));
  return { devices: snapshot(), errors };
}

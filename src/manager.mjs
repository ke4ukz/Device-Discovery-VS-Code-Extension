import { normalizeDevice } from './registry.mjs';

// Each discoverer owns its sockets/timers. A failed discoverer leaves others running.
export async function scanDiscoverers(discoverers, adapter, {
  signal, duration = 5000, onDevice = () => {}, log = () => {}, discovererOptions = {},
} = {}) {
  const results = new Map();
  const errors = [];
  const snapshot = () => [...results.values()].flat();
  await Promise.all(discoverers.map(async discoverer => {
    const update = devices => {
      const normalized = devices.map(device => normalizeDevice(discoverer, device));
      const unique = new Map(normalized.map(device => [
        device.identity ?? device.macAddress?.toUpperCase() ?? `${device.ip}/${device.hostname ?? ''}`, device,
      ]));
      results.set(discoverer.id, [...unique.values()]);
      onDevice(snapshot());
    };
    try {
      update(await discoverer.scan(adapter, { ...discovererOptions[discoverer.id], signal, duration, onDevice: update,
        log: message => log(`[${discoverer.name}] ${message}`) }));
    } catch (error) {
      errors.push({ discovererId: discoverer.id, discoverer: discoverer.name, message: error.message });
      log(`[${discoverer.name}] Scan failed: ${error.message}`);
    }
  }));
  return { devices: snapshot(), errors };
}

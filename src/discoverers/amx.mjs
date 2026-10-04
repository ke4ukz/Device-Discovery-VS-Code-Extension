import dgram from 'node:dgram';
import { parseBeacon } from '../amx-protocol.mjs';
import { scanTimer } from '../scan-timer.mjs';

export function scanBeacons(adapter, { signal, duration = 5000, onDevice = () => {}, log = () => {},
  createSocket = () => dgram.createSocket({ type: 'udp4', reuseAddr: true }) } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { resolve([]); return; }
    const socket = createSocket(), devices = new Map();
    let finished = false, stopTimer = () => {};
    const finish = error => {
      if (finished) return;
      finished = true; stopTimer();
      signal?.removeEventListener('abort', cancel);
      try { socket.close(); } catch { /* A failed bind may not have an open socket. */ }
      error ? reject(error) : resolve([...devices.values()]);
    };
    const cancel = () => finish();
    signal?.addEventListener('abort', cancel, { once: true });
    socket.on('error', finish);
    socket.on('message', (bytes, sender) => {
      if (finished) return;
      const device = parseBeacon(bytes, sender.address);
      if (!device) { log(`Ignored non-beacon packet from ${sender.address}`); return; }
      devices.set(device.identity, device);
      onDevice([...devices.values()]);
    });
    try {
      socket.bind(9131, '0.0.0.0', () => {
        if (finished) return;
        try {
          socket.addMembership('239.255.250.250', adapter.address);
          log(`Listening for AMX-compatible beacons via ${adapter.name} (${adapter.address}); no query is sent.`);
          log('Some devices announce only every 10–60 seconds. Use continuous scanning or a longer duration if needed.');
          stopTimer = scanTimer(duration, () => finish());
        } catch (error) { finish(error); }
      });
    } catch (error) { finish(error); }
  });
}

const sharedScan = { id: 'amx-beacon', name: 'AMX Beacon', scan: scanBeacons };
const columns = [['manufacturer', 'Manufacturer'], ['model', 'Model'], ['ip', 'IP Address'],
  ['macAddress', 'MAC Address'], ['revision', 'Revision'], ['uuid', 'UUID'],
  ['serialNumber', 'Serial Number'], ['sdkClass', 'Device Class'], ['configName', 'Configuration Name'],
  ['configUrl', 'Configuration URL'], ['moduleAddress', 'Module Address'], ['deviceStatus', 'Status']];

function discoverer(id, name, command, accepts) {
  return { id, name, command, columns, sharedScan, accepts,
    async scan(adapter, options = {}) {
      const results = await scanBeacons(adapter, { ...options,
        onDevice: devices => options.onDevice?.(devices.filter(accepts)) });
      return results.filter(accepts);
    } };
}

export const globalCache = discoverer('globalCache', 'Global Caché', 'deviceDiscovery.scanGlobalCache', device => device.globalCache);
export const amx = discoverer('amx', 'AMX Discovery', 'deviceDiscovery.scanAmx', device => !device.globalCache);

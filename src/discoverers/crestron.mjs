import dgram from 'node:dgram';
import os from 'node:os';
import { parseResponse } from './crestron-protocol.mjs';
import { scanTimer } from '../scan-timer.mjs';

export const crestron = {
  id: 'crestron', name: 'Crestron',
  command: 'deviceDiscovery.scanCrestron',
  columns: [
    ['hostname', 'Hostname'], ['model', 'Model'], ['ip', 'IP Address'],
    ['serialNumberOrTsid', 'Serial Number/TSID'], ['firmwareVersion', 'Firmware'],
    ['macAddress', 'MAC Address'], ['firmwareBuildDate', 'Firmware Build Date'],
  ],
  scan,
};

export function scan(adapter, { signal, onDevice = () => {}, log = () => {},
  duration = 5000, createSocket = () => dgram.createSocket('udp4') } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { resolve([]); return; }
    const socket = createSocket();
    const devices = new Map();
    let stopTimer = () => {}, interval, finished = false;
    const finish = error => {
      if (finished) return;
      finished = true;
      stopTimer();
      clearInterval(interval);
      signal?.removeEventListener('abort', cancel);
      try { socket.close(); } catch { /* A failed bind may leave no open socket. */ }
      error ? reject(error) : resolve([...devices.values()]);
    };
    const cancel = () => finish();
    signal?.addEventListener('abort', cancel, { once: true });
    socket.on('error', finish);
    socket.on('message', (bytes, sender) => {
      if (finished) return;
      const parsed = parseResponse(bytes);
      if (!parsed) { log(`Ignored ${bytes.length}-byte packet from ${sender.address}`); return; }
      const device = { ip: sender.address, ...parsed };
      // A device may change IP or reply repeatedly from different source ports.
      devices.set(parsed.macAddress ?? `${sender.address}/${parsed.hostname}`, device);
      onDevice([...devices.values()]);
    });
    const query = Buffer.alloc(266);
    Buffer.from([0x14, 0, 0, 0, 1, 4, 0, 3, 0, 0]).copy(query);
    Buffer.from(os.hostname(), 'ascii').copy(query, 10, 0, 255);
    const broadcast = adapter.address.split('.').map((byte, index) =>
      Number(byte) | (255 ^ Number(adapter.netmask.split('.')[index]))).join('.');
    const destinations = [...new Set(['255.255.255.255', broadcast])];
    try {
      socket.bind(41794, adapter.address, () => {
        if (finished) return;
        try {
          socket.setBroadcast(true);
          log(`Scanning ${adapter.name} (${adapter.address}/${adapter.netmask})`);
          const send = () => {
            for (const target of destinations) {
              if (finished) break;
              log(`Query -> ${target}:41794`);
              socket.send(query, 41794, target, error => { if (error) finish(error); });
            }
          };
          stopTimer = scanTimer(duration, () => finish());
          interval = setInterval(send, 5000);
          send();
        } catch (error) { finish(error); }
      });
    } catch (error) { finish(error); }
  });
}

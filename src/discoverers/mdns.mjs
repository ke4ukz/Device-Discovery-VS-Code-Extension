import dgram from 'node:dgram';
import { query, decode, ServiceCache } from '../mdns-protocol.mjs';
import { scanTimer } from '../scan-timer.mjs';

const group = '224.0.0.251';
const enumeration = '_services._dns-sd._udp.local.';
const initialTypes = ['_http._tcp.local.', '_https._tcp.local.', '_ssh._tcp.local.',
  '_shure._tcp.local.', '_netaudio-chan._udp.local.', '_netaudio-cmc._udp.local.',
  '_netaudio-arc._udp.local.', '_dante-ddm-d._udp.local.'];

export const mdns = {
  id: 'mdns', name: 'mDNS', command: 'deviceDiscovery.scanMdns', scan,
  columns: [['serviceName', 'Service Name'], ['serviceType', 'Service Type'],
    ['hostname', 'Hostname'], ['ip', 'IP Address'], ['port', 'Port'], ['txtRecords', 'TXT Records']],
};

export function matchesServiceType(type, filters = []) {
  const normalized = type.toLowerCase().replace(/\.$/, '');
  return !filters.length || filters.some(filter => {
    const value = filter.trim().toLowerCase().replace(/\.$/, '');
    return value.includes('.') ? normalized === (value.endsWith('.local') ? value : `${value}.local`)
      : normalized.split('.')[0] === value;
  });
}

export function scan(adapter, { signal, duration = 5000, onDevice = () => {}, log = () => {},
  serviceTypes = [], createSocket = () => dgram.createSocket({ type: 'udp4', reuseAddr: true }) } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { resolve([]); return; }
    const socket = createSocket(), cache = new ServiceCache();
    const types = new Set(initialTypes), asked = new Set();
    for (const filter of serviceTypes) {
      const value = filter.trim().toLowerCase().replace(/\.$/, '');
      if (!value.includes('.')) {
        types.add(`${value}._tcp.local.`); types.add(`${value}._udp.local.`);
      } else types.add(value.endsWith('.local') ? `${value}.` : `${value}.local.`);
    }
    const results = () => cache.devices().filter(device => matchesServiceType(device.serviceType, serviceTypes));
    let interval, stopTimer = () => {}, finished = false;
    const finish = error => {
      if (finished) return;
      finished = true; clearInterval(interval); stopTimer();
      signal?.removeEventListener('abort', cancel);
      try { socket.close(); } catch { /* Bind can fail before a socket is open. */ }
      error ? reject(error) : resolve(results());
    };
    const cancel = () => finish();
    signal?.addEventListener('abort', cancel, { once: true });
    socket.on('error', finish);
    const send = questions => {
      if (finished || !questions.length) return;
      socket.send(query(questions), 5353, group, error => { if (error) finish(error); });
    };
    const request = (name, type) => {
      const key = `${name.toLowerCase()}/${type}`;
      if (!asked.has(key)) { asked.add(key); send([{ name, type }]); }
    };
    socket.on('message', bytes => {
      if (finished) return;
      try {
        const records = decode(bytes);
        cache.ingest(records);
        for (const record of records) {
          if (!record.ttl) continue;
          if (record.type === 12 && record.target) {
            if (record.name.toLowerCase() === enumeration) {
              types.add(record.target); request(record.target, 12);
            } else if (/^_.+\._(?:tcp|udp)\.local\.$/i.test(record.name)) {
              request(record.target, 33); request(record.target, 16);
            }
          } else if (record.type === 33 && record.target) request(record.target, 1);
        }
        onDevice(results());
      } catch (error) { log(`Ignored mDNS packet: ${error.message}`); }
    });
    try {
      // Bind wildcard to receive multicast; membership and outgoing interface
      // restrict the socket to the selected adapter. Multicast-only responses
      // coexist with the operating system's Bonjour/mDNS responder.
      socket.bind(5353, '0.0.0.0', () => {
        if (finished) return;
        try {
          socket.addMembership(group, adapter.address);
          socket.setMulticastInterface(adapter.address);
          socket.setMulticastTTL(255);
          socket.setMulticastLoopback(false);
          log(`Browsing mDNS via ${adapter.name} (${adapter.address})`);
          if (serviceTypes.length) log(`Showing only service types: ${serviceTypes.join(', ')}`);
          const browse = () => {
            asked.clear();
            send([{ name: enumeration, type: 12 }, ...[...types].map(name => ({ name, type: 12 }))]);
            // Retry resolution if records arrived in separate packets or a reply was lost.
            for (const record of cache.records.values()) {
              if (record.type === 12 && record.name.toLowerCase() !== enumeration) {
                request(record.target, 33); request(record.target, 16);
              } else if (record.type === 33) request(record.target, 1);
            }
            onDevice(results());
          };
          stopTimer = scanTimer(duration, () => finish());
          interval = setInterval(browse, 1000);
          browse();
        } catch (error) { finish(error); }
      });
    } catch (error) { finish(error); }
  });
}

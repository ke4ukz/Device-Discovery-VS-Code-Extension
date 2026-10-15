import dgram from 'node:dgram';
import { parseQdp, qsysDevices } from '../qsys-protocol.mjs';
import { scanTimer } from '../scan-timer.mjs';

export const qsys = {
  id: 'qsys', name: 'Q-SYS', command: 'deviceDiscovery.scanQsys',
  columns: [['hostname', 'Name'], ['model', 'Model'], ['ip', 'IP Address'],
    ['macAddress', 'MAC Address'], ['lan', 'LAN'], ['deviceType', 'Device Type'],
    ['designName', 'Design Name'], ['redundancy', 'Redundancy'], ['deviceRef', 'Device Reference']],
  scan,
};

export function scan(adapter, { signal, duration = 5000, onDevice = () => {}, log = () => {},
  createSocket = () => dgram.createSocket({ type: 'udp4', reuseAddr: true }) } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { resolve([]); return; }
    const socket = createSocket(), listener = createSocket(), devices = new Map(), controls = new Map();
    let finished = false, interval, stopTimer = () => {};
    const finish = error => {
      if (finished) return;
      finished = true;
      stopTimer(); clearInterval(interval);
      signal?.removeEventListener('abort', cancel);
      for (const transport of [socket, listener]) {
        try { transport.close(); } catch { /* Bind may have failed. */ }
      }
      error ? reject(error) : resolve(qsysDevices(devices, controls));
    };
    const cancel = () => finish();
    signal?.addEventListener('abort', cancel, { once: true });
    const receive = (bytes, sender) => {
      if (finished) return;
      const records = parseQdp(bytes);
      if (!records?.length) { log(`Ignored non-QDP response from ${sender.address}`); return; }
      const lastSeen = new Date().toISOString(), details = bytes.toString('utf8');
      for (const { type, fields } of records) {
        const record = { fields, sender: sender.address, lastSeen, details };
        if (type === 'device') devices.set(fields.ref, record);
        else controls.set(fields.device_ref, record);
      }
      onDevice(qsysDevices(devices, controls));
    };
    for (const transport of [socket, listener]) {
      transport.on('error', finish);
      transport.on('message', receive);
    }
    try {
      // Touch panels also advertise to the multicast group on port 2467.
      // Bind the wildcard address so multicast is delivered on macOS/Windows.
      listener.bind(2467, '0.0.0.0', () => {
        if (finished) return;
        try {
          listener.addMembership('224.0.23.175', adapter.address);
          log(`Listening for QDP announcements on 224.0.23.175:2467 via ${adapter.address}`);
        } catch (error) { finish(error); }
      });
      if (finished) return;
      // Keep an ephemeral query socket for devices that reply unicast.
      socket.bind(0, adapter.address, () => {
        if (finished) return;
        try {
          socket.setMulticastInterface(adapter.address);
          log(`Querying Q-SYS via ${adapter.name} (${adapter.address})`);
          const send = () => {
            for (const port of [2467, 2468]) for (const ref of ['device.*', 'control.*', 'device.ioframe.*']) {
              if (finished) return;
              log(`QDP ${ref} -> 224.0.23.175:${port}`);
              socket.send(Buffer.from(`<QDP><query_ref>${ref}</query_ref></QDP>`), port, '224.0.23.175',
                error => { if (error) finish(error); });
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

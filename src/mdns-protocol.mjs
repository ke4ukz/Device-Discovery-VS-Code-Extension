// DNS wire encoding/decoding for browsing PTR/SRV/TXT/A records.
export function query(questions) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(questions.length, 4);
  return Buffer.concat([header, ...questions.map(({ name, type }) => {
    const labels = name.replace(/\.$/, '').split('.').map(label => {
      const bytes = Buffer.from(label);
      if (!bytes.length || bytes.length > 63) throw new Error('Invalid DNS label');
      return Buffer.concat([Buffer.from([bytes.length]), bytes]);
    });
    const tail = Buffer.alloc(5);
    tail.writeUInt16BE(type, 1);
    tail.writeUInt16BE(1, 3);
    return Buffer.concat([...labels, tail]);
  })]);
}

export function decode(bytes) {
  const need = (offset, size) => {
    if (offset < 0 || offset + size > bytes.length) throw new Error('Truncated DNS packet');
  };
  const nameAt = start => {
    let offset = start, end, size = 0;
    const labels = [], seen = new Set();
    while (true) {
      need(offset, 1);
      if (seen.has(offset)) throw new Error('DNS pointer loop');
      seen.add(offset);
      const length = bytes[offset++];
      if ((length & 0xc0) === 0xc0) {
        need(offset, 1);
        end ??= offset + 1;
        offset = ((length & 0x3f) << 8) | bytes[offset];
        continue;
      }
      if (length & 0xc0) throw new Error('Invalid DNS label');
      if (!length) return { name: labels.join('.') + '.', end: end ?? offset };
      need(offset, length);
      size += length + 1;
      if (size > 255) throw new Error('DNS name too long');
      labels.push(bytes.subarray(offset, offset + length).toString('utf8'));
      offset += length;
    }
  };
  need(0, 12);
  if (!(bytes.readUInt16BE(2) & 0x8000)) return [];
  let offset = 12;
  for (let i = 0; i < bytes.readUInt16BE(4); i++) { offset = nameAt(offset).end; need(offset, 4); offset += 4; }
  const count = bytes.readUInt16BE(6) + bytes.readUInt16BE(8) + bytes.readUInt16BE(10);
  const records = [];
  for (let i = 0; i < count; i++) {
    const owner = nameAt(offset); offset = owner.end;
    need(offset, 10);
    const type = bytes.readUInt16BE(offset), klass = bytes.readUInt16BE(offset + 2);
    const ttl = bytes.readUInt32BE(offset + 4), length = bytes.readUInt16BE(offset + 8);
    offset += 10; need(offset, length);
    const end = offset + length;
    const record = { name: owner.name, type, ttl, flush: Boolean(klass & 0x8000) };
    if ((klass & 0x7fff) === 1) {
      if (type === 12) {
        const ptr = nameAt(offset);
        if (ptr.end > end) throw new Error('Invalid PTR length');
        record.target = ptr.name;
      } else if (type === 33) {
        if (length < 7) throw new Error('Invalid SRV length');
        record.port = bytes.readUInt16BE(offset + 4);
        const host = nameAt(offset + 6);
        if (host.end > end) throw new Error('Invalid SRV target');
        record.target = host.name;
      } else if (type === 1 && length === 4) {
        record.address = [...bytes.subarray(offset, end)].join('.');
      } else if (type === 16) {
        record.txt = [];
        let cursor = offset;
        while (cursor < end) {
          const size = bytes[cursor++];
          if (cursor + size > end) throw new Error('Invalid TXT length');
          record.txt.push(bytes.subarray(cursor, cursor + size).toString('utf8'));
          cursor += size;
        }
      }
      records.push(record);
    }
    offset = end;
  }
  return records;
}

export class ServiceCache {
  records = new Map();
  ingest(records, now = Date.now()) {
    // Apply cache-flush once per packet so multiple A records are retained.
    const flushed = new Set();
    for (const record of records) {
      const group = `${record.name.toLowerCase()}/${record.type}`;
      if (record.flush && record.ttl && !flushed.has(group)) {
        for (const [key, value] of this.records) if (value.group === group) this.records.delete(key);
        flushed.add(group);
      }
      const key = `${group}/${JSON.stringify([record.target, record.address, record.port, record.txt])}`;
      if (!record.ttl) this.records.delete(key);
      else this.records.set(key, { ...record, group, expires: now + record.ttl * 1000 });
    }
    for (const [key, record] of this.records) if (record.expires <= now) this.records.delete(key);
  }
  devices() {
    this.ingest([]);
    const records = [...this.records.values()];
    const devices = [];
    for (const ptr of records.filter(record => record.type === 12 && /^_.+\._(?:tcp|udp)\.local\.$/i.test(record.name))) {
      const service = records.find(record => record.type === 33 && record.name.toLowerCase() === ptr.target.toLowerCase());
      if (!service) continue;
      const txt = records.find(record => record.type === 16 && record.name.toLowerCase() === ptr.target.toLowerCase());
      for (const address of records.filter(record => record.type === 1 && record.name.toLowerCase() === service.target.toLowerCase())) {
        const serviceType = ptr.name.replace(/\.$/, '');
        const instance = ptr.target.slice(0, -(ptr.name.length + 1));
        const hostname = service.target.replace(/\.$/, '');
        devices.push({ ip: address.address, hostname, serviceType, serviceName: instance,
          port: service.port, txtRecords: (txt?.txt ?? []).join('; '),
          identity: `${ptr.target.toLowerCase()}/${address.address}`,
          details: `${ptr.target}\nHost: ${hostname}\nPort: ${service.port}\n${(txt?.txt ?? []).join('\n')}` });
      }
    }
    return devices;
  }
}

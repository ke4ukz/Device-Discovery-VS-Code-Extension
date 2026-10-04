export function parseBeacon(bytes, ip) {
  const details = bytes.toString('utf8').trim();
  if (!details.startsWith('AMXB')) return null;
  const fields = new Map();
  for (const match of details.matchAll(/<([^=<>]+)=([^<>]*)>/g)) {
    const key = match[1].trim().replace(/^-/, '').replace(/^Device-/i, '').toLowerCase();
    fields.set(key, match[2].trim());
  }
  const manufacturer = fields.get('make') ?? '';
  const model = fields.get('model') ?? '';
  const uuid = fields.get('uuid') ?? '';
  if (!manufacturer && !model && !uuid) return null;
  const compactMake = manufacturer.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const globalCache = ['globalcache', 'globalcacheinc', 'globalcachellc'].includes(compactMake)
    || (!manufacturer && /^(?:GlobalCache_|GC100_)|_GlobalCache$/i.test(uuid));
  let mac;
  if (/^[a-f0-9]{12}$/i.test(uuid)) mac = uuid;
  else if (/^(?:[a-f0-9]{2}[:-]){5}[a-f0-9]{2}$/i.test(uuid)) mac = uuid.replace(/[:-]/g, '');
  else if (globalCache) mac = /(?:^|_)([a-f0-9]{12})(?:_|$)/i.exec(uuid)?.[1];
  const moduleAddress = fields.get('mod_addr') ?? '';
  return { ip, manufacturer, model, uuid, globalCache, moduleAddress,
    revision: fields.get('revision') ?? '', serialNumber: fields.get('sn') ?? '',
    sdkClass: fields.get('sdkclass') ?? '', configName: fields.get('config-name') ?? '',
    configUrl: fields.get('config-url') ?? '', deviceStatus: fields.get('status') ?? '',
    macAddress: mac?.match(/.{2}/g).join(':').toUpperCase(),
    identity: uuid ? `${uuid.toLowerCase()}/${moduleAddress}` : `${ip}/${model}/${moduleAddress}`,
    details };
}

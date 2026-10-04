const headers = ['15000000018400010000', '15000000018400000000'];

function textAt(data, start, end = data.length) {
  const bytes = data.subarray(start, end);
  const terminator = bytes.indexOf(0);
  return bytes.subarray(0, terminator < 0 ? bytes.length : terminator).toString('ascii');
}

export function parseResponse(data) {
  if (data.length !== 394 || !headers.includes(data.subarray(0, 10).toString('hex'))) return null;
  const hostname = textAt(data, 10, 266);
  const details = textAt(data, 266);
  const match = /^(.*?) \[v([^\s]+) \((.*?)\), ([#%$])([^\]]+)\] @E-([a-f0-9]{12})$/i.exec(details);
  return { hostname, details, ...(match ? {
    model: match[1], firmwareVersion: match[2], firmwareBuildDate: match[3],
    serialNumberOrTsid: match[4] + match[5],
    identifierPrefix: match[4],
    macAddress: match[6].match(/.{2}/g).join(':').toUpperCase(),
  } : {}) };
}

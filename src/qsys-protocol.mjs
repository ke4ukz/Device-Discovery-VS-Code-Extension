import { isIPv4 } from 'node:net';

// QDP uses a small XML vocabulary. No DTDs, external entities, or network
// resources are needed. Parse a bounded document and reject malformed input.
function decode(text) {
  return text.replace(/&([^;]*);|&/g, (entity, name) => {
    const predefined = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(predefined, name)) return predefined[name];
    const code = /^#x[0-9a-f]+$/i.test(name) ? parseInt(name.slice(2), 16)
      : /^#[0-9]+$/.test(name) ? Number(name.slice(1)) : NaN;
    if (!Number.isInteger(code) || !(code === 9 || code === 10 || code === 13 ||
      code >= 32 && code <= 0xd7ff || code >= 0xe000 && code <= 0xfffd || code >= 0x10000 && code <= 0x10ffff)) {
      throw new Error('Invalid XML entity');
    }
    return String.fromCodePoint(code);
  });
}

export function parseQdp(bytes) {
  if (bytes.length > 65507) return null;
  const xml = bytes.toString('utf8').replace(/^\uFEFF/, '');
  const document = { children: [], text: '' }, stack = [document];
  try {
    const tokens = xml.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<[^>]*>|[^<]+/g) ?? [];
    if (tokens.join('') !== xml) return null;
    for (const token of tokens) {
      const current = stack.at(-1);
      if (token.startsWith('<!--') || token.startsWith('<?')) continue;
      if (token.startsWith('<![CDATA[')) {
        if (stack.length === 1) return null;
        current.text += token.slice(9, -3);
      } else if (token.startsWith('</')) {
        if (stack.length === 1 || token !== `</${current.tag}>`) return null;
        stack.pop();
      } else if (token.startsWith('<')) {
        const match = /^<([A-Za-z_][\w.-]*)(?:\s+[A-Za-z_][\w.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*(\/?)>$/.exec(token);
        if (!match || stack.length > 16) return null;
        const node = { tag: match[1], children: [], text: '' };
        current.children.push(node);
        if (!match[2]) stack.push(node);
      } else {
        if (stack.length === 1 && token.trim()) return null;
        current.text += decode(token);
      }
    }
    if (stack.length !== 1 || document.children.length !== 1 || document.children[0].tag !== 'QDP') return null;
    return document.children[0].children.filter(record => ['device', 'control'].includes(record.tag))
      .map(record => ({ type: record.tag, fields: Object.fromEntries(record.children.map(child => [child.tag, child.text.trim()])) }))
      .filter(record => record.type === 'device' ? record.fields.ref : record.fields.device_ref);
  } catch { return null; }
}

export function qsysDevices(devices, controls) {
  return [...devices].flatMap(([ref, { fields, sender, lastSeen, details }]) => {
    const control = controls.get(ref);
    const common = { hostname: fields.name ?? '', model: fields.part_number || fields.type || 'Q-SYS device',
      manufacturer: 'QSC', deviceType: fields.type ?? '', deviceRef: ref,
      designName: control?.fields.design_pretty ?? '',
      redundancy: control?.fields.redundant === '1' ? (control.fields.primary === '1' ? 'Primary' : 'Backup') : '',
      lastSeen: control && control.lastSeen > lastSeen ? control.lastSeen : lastSeen,
      details: control ? `${details}\n${control.details}` : details };
    const lans = ['a', 'b'].filter(lan => isIPv4(fields[`lan_${lan}_ip`] ?? ''));
    return (lans.length ? lans : ['']).map(lan => ({ ...common,
      ip: lan ? fields[`lan_${lan}_ip`] : sender,
      macAddress: fields[`lan_${lan || 'a'}_mac`] ?? '',
      lan: lan.toUpperCase(), identity: `${ref}/${lan || 'sender'}` }));
  });
}

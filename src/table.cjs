const summaryColumns = [
  ['discoverer', 'Discoverer'], ['ip', 'IP Address'],
  ['hostname', 'Hostname'], ['macAddress', 'MAC Address'],
];
const escape = value => String(value ?? '—').replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

exports.render = (devices, status, discoverer) => {
const columns = discoverer?.columns ?? summaryColumns;
const title = discoverer ? `${discoverer.name} Devices` : 'All Devices';
const command = discoverer ? `Device Discovery: Scan for ${discoverer.name} Devices` : 'Device Discovery: Scan for All Devices';
return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<title>${escape(title)}</title><style>
body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px; }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 10px; border-bottom: 1px solid var(--vscode-panel-border); }
th { white-space: nowrap; } td { user-select: text; } .scroll { overflow-x: auto; } summary { cursor: pointer; } pre { white-space: pre-wrap; }
</style></head><body><h1>${escape(title)}</h1><p role="status">${escape(status)}</p>
<p>Use <strong>${escape(command)}</strong> in the Command Palette to refresh.</p>
<div class="scroll"><table><caption>${devices.length} device${devices.length === 1 ? '' : 's'}</caption>
<thead><tr>${columns.map(([, title]) => `<th scope="col">${title}</th>`).join('')}</tr></thead>
<tbody>${[...devices].sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true })).map(device =>
  `<tr>${columns.map(([field]) => `<td>${escape(device[field])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
${discoverer ? devices.map(device => `<details><summary>${escape(device.hostname ?? device.ip)} — Raw details</summary><pre>${escape(device.details)}</pre></details>`).join('') : ''}
</body></html>`;
};

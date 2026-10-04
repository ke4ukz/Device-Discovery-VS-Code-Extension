const { randomBytes } = require('node:crypto');

const summaryColumns = [
  ['discoverer', 'Discoverer'], ['ip', 'IP Address'],
  ['hostname', 'Hostname'], ['macAddress', 'MAC Address'],
];
const escape = value => String(value ?? '—').replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

const columnsFor = discoverer => discoverer?.columns ?? summaryColumns;
const sortDevices = devices => [...devices].sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
exports.columnsFor = columnsFor;
exports.sortDevices = sortDevices;

exports.render = (devices, status, discoverer) => {
const nonce = randomBytes(16).toString('base64');
const columns = columnsFor(discoverer);
const title = discoverer ? `${discoverer.name} Devices` : 'All Devices';
const command = discoverer ? `Device Discovery: Scan for ${discoverer.name} Devices` : 'Device Discovery: Scan for All Devices';
return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>${escape(title)}</title><style>
body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
button { font: inherit; border: none; padding: 8px 14px; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
button:hover { background: var(--vscode-button-hoverBackground); }
button:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
button:disabled { opacity: .5; cursor: default; }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 10px; border-bottom: 1px solid var(--vscode-panel-border); }
th { white-space: nowrap; } td { user-select: text; } .scroll { overflow-x: auto; } summary { cursor: pointer; } pre { white-space: pre-wrap; }
</style></head><body><div class="toolbar"><h1>${escape(title)}</h1><button id="exportCsv" type="button"${devices.length ? '' : ' disabled'}>Export CSV</button></div><p role="status">${escape(status)}</p>
<p>Use <strong>${escape(command)}</strong> in the Command Palette to refresh.</p>
<div class="scroll"><table><caption>${devices.length} device${devices.length === 1 ? '' : 's'}</caption>
<thead><tr>${columns.map(([, title]) => `<th scope="col">${title}</th>`).join('')}</tr></thead>
<tbody>${sortDevices(devices).map(device =>
  `<tr>${columns.map(([field]) => `<td>${escape(device[field])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
${discoverer ? devices.map(device => `<details><summary>${escape(device.hostname ?? device.ip)} — Raw details</summary><pre>${escape(device.details)}</pre></details>`).join('') : ''}
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
document.getElementById('exportCsv').addEventListener('click', () => {
  vscode.postMessage({ command: 'exportCsv' });
});
</script>
</body></html>`;
};

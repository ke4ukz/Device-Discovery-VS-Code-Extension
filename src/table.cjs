const { randomBytes } = require('node:crypto');

const summaryColumns = [
  ['discoverer', 'Discoverer'], ['ip', 'IP Address'],
  ['hostname', 'Hostname'], ['macAddress', 'MAC Address'],
];
const escape = value => String(value ?? '—').replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const deviceKey = device => JSON.stringify([device.discovererId,
  device.identity ?? device.macAddress?.toUpperCase() ?? `${device.ip}/${device.hostname ?? ''}`]);

const columnsFor = discoverer => [...(discoverer?.columns ?? summaryColumns), ['lastSeen', 'Last Seen']];
const sortDevices = (devices, { preserveOrder = false } = {}) => preserveOrder ? [...devices]
  : [...devices].sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
exports.columnsFor = columnsFor;
exports.sortDevices = sortDevices;

// Shared with the webview so timestamps also age after a scan stops.
function formatLastSeen(value, now = Date.now()) {
  const timestamp = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp)) return '—';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (now - timestamp > 24 * 60 * 60 * 1000) return new Date(timestamp).toLocaleString();
  if (seconds < 60) return 'a few seconds ago';
  const count = seconds < 3600 ? Math.floor(seconds / 60) : Math.floor(seconds / 3600);
  const unit = seconds < 3600 ? 'minute' : 'hour';
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}
exports.formatLastSeen = formatLastSeen;

exports.render = (devices, status, discoverer, scanControl) => {
const nonce = randomBytes(16).toString('base64');
const columns = columnsFor(discoverer);
const scanning = scanControl?.running === true;
const warning = scanControl?.warning ? '<div class="scan-warning" role="alert"><strong>New scan not started.</strong> A scan is already running. Stop or cancel it, then run your requested command again.</div>' : '';
const scanLabel = scanning ? (scanControl.continuous ? 'Stop' : 'Cancel') : (scanControl?.continuous ? 'Start' : 'Refresh Scan');
const scanButton = `<button id="scanAction" type="button" data-scan-id="${escape(scanControl?.id ?? '')}" data-command="${scanning ? 'stopScan' : 'startScan'}"${scanControl?.stopping ? ' disabled' : ''}>${scanLabel}</button>`;
const title = discoverer ? `${discoverer.name} Devices` : 'All Devices';
const command = discoverer ? `Device Discovery: Scan for ${discoverer.name} Devices` : 'Device Discovery: Scan for All Devices';
return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>${escape(title)}</title><style>
body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px; }
.scan-warning { margin-bottom: 16px; padding: 12px; border: 1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-editorWarning-foreground)); background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-inputValidation-warningForeground, var(--vscode-editor-foreground)); }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
button { font: inherit; border: none; padding: 8px 14px; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
button:hover { background: var(--vscode-button-hoverBackground); }
button:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
button:disabled { opacity: .5; cursor: default; }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 10px; border-bottom: 1px solid var(--vscode-panel-border); }
th { white-space: nowrap; } td { user-select: text; } .scroll { overflow-x: auto; } summary { cursor: pointer; } pre { white-space: pre-wrap; }
</style></head><body><main>${warning}<div class="toolbar"><h1>${escape(title)}</h1><div>${scanButton} <button id="exportCsv" type="button"${devices.length ? '' : ' disabled'}>Export CSV</button></div></div><p role="status">${escape(status)}</p>
<p>Use the scan button above or <strong>${escape(command)}</strong> in the Command Palette.</p>
<div class="scroll"><table><caption>${devices.length} device${devices.length === 1 ? '' : 's'}</caption>
<thead><tr>${columns.map(([, title]) => `<th scope="col">${title}</th>`).join('')}</tr></thead>
<tbody>${sortDevices(devices, { preserveOrder: scanControl?.preserveOrder }).map(device =>
  `<tr data-key="${escape(deviceKey(device))}">${columns.map(([field]) => field === 'lastSeen'
    ? `<td><time datetime="${escape(device.lastSeen ?? '')}" title="${escape(device.lastSeen ?? '')}">${escape(formatLastSeen(device.lastSeen))}</time></td>`
    : `<td>${escape(device[field])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
${discoverer ? devices.map(device => `<details data-key="${escape(deviceKey(device))}"><summary>${escape(device.hostname ?? device.ip)} — Raw details</summary><pre>${escape(device.details)}</pre></details>`).join('') : ''}
</main>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
${formatLastSeen.toString()}
const selecting = () => { const selection = window.getSelection(); return selection && !selection.isCollapsed; };
// Keep existing DOM nodes, including open details, instead of reloading the
// webview. Defer updates during text selection so even changed values are copyable.
function reconcile(current, incoming) {
  if (current.nodeType === Node.TEXT_NODE) {
    if (current.data !== incoming.data) current.data = incoming.data;
    return;
  }
  for (const attribute of [...current.attributes]) {
    if (attribute.name !== 'open' && !incoming.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of incoming.attributes) {
    if (attribute.name !== 'open' && current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
  }
  const old = [...current.childNodes];
  const keyed = new Map(old.filter(node => node.nodeType === Node.ELEMENT_NODE && node.dataset.key)
    .map(node => [node.tagName + node.dataset.key, node]));
  const used = new Set();
  let cursor = current.firstChild;
  for (const next of incoming.childNodes) {
    const key = next.nodeType === Node.ELEMENT_NODE && next.dataset.key;
    let existing = key ? keyed.get(next.tagName + key) : cursor;
    if (existing && (used.has(existing) || existing.nodeType !== next.nodeType || existing.nodeName !== next.nodeName ||
        (!key && existing.nodeType === Node.ELEMENT_NODE && existing.dataset.key))) existing = undefined;
    if (!existing) {
      existing = next.cloneNode(true);
      current.insertBefore(existing, cursor);
    } else {
      if (existing !== cursor) current.insertBefore(existing, cursor);
      reconcile(existing, next);
    }
    used.add(existing);
    cursor = existing.nextSibling;
  }
  for (const node of old) if (!used.has(node)) node.remove();
}
let pending;
const applyPending = () => {
  if (!pending || selecting()) return;
  const incoming = new DOMParser().parseFromString(pending, 'text/html').querySelector('main');
  pending = undefined;
  if (incoming) reconcile(document.querySelector('main'), incoming);
};
window.addEventListener('message', event => {
  if (event.data?.command !== 'updateResults') return;
  pending = event.data.html;
  applyPending();
});
document.addEventListener('selectionchange', applyPending);
const updateLastSeen = () => {
  if (selecting()) return;
  for (const element of document.querySelectorAll('time[datetime]')) {
    const text = formatLastSeen(element.dateTime);
    if (element.textContent !== text) element.textContent = text;
  }
};
updateLastSeen();
setInterval(updateLastSeen, 1000);
document.addEventListener('click', event => {
  const stopButton = event.target.closest('#scanAction');
  if (!stopButton) return;
  stopButton.disabled = true;
  vscode.postMessage({ command: stopButton.dataset.command, scanId: stopButton.dataset.scanId });
});
document.addEventListener('click', event => {
  if (event.target.closest('#exportCsv')) vscode.postMessage({ command: 'exportCsv' });
});
vscode.postMessage({ command: 'ready' });
</script>
</body></html>`;
};

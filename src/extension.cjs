const vscode = require('vscode');
const { render, sortDevices } = require('./table.cjs');
const { mergeDevices } = require('./results.cjs');
const { readScanSettings, selectAdapter } = require('./settings.cjs');
const { toCsv, defaultFilename } = require('./csv.cjs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

exports.activate = async context => {
  const { listAdapters } = await import('./adapters.mjs');
  const { discoverers } = await import('./registry.mjs');
  const { scanDiscoverers } = await import('./manager.mjs');
  const output = vscode.window.createOutputChannel('Device Discovery');
  let scanWarning = false;
  let panel, controller, scanControl, activeDiscoverer, activeAdapterName, nextAdapter, devices = [], status = 'Run a scan to view devices.';
  const refresh = () => { if (panel) panel.webview.html = render(devices, status, activeDiscoverer, scanControl ? { ...scanControl, warning: scanWarning } : undefined); };
  const show = () => {
    const title = activeDiscoverer ? `${activeDiscoverer.name} Devices` : 'All Devices';
    if (panel) { panel.title = title; panel.reveal(); }
    else {
      panel = vscode.window.createWebviewPanel('deviceDiscovery', title, vscode.ViewColumn.One, { enableScripts: true, localResourceRoots: [] });
      panel.webview.onDidReceiveMessage(async message => {
        if (message?.command === 'startScan' && !controller && message.scanId === (scanControl?.id ?? '')) {
          try { await runScan(activeDiscoverer, { resume: true }); }
          catch (error) { status = `Scan failed: ${error.message}`; output.appendLine(status); }
          finally { refresh(); }
          return;
        }
        if (message?.command === 'stopScan' && controller && scanControl && message.scanId === scanControl.id) {
          scanWarning = false;
          controller?.abort();
          scanControl.stopping = true;
          status = 'Stopping scan; keeping responses received so far…';
          refresh();
        }
        if (message?.command === 'exportCsv') return vscode.commands.executeCommand('deviceDiscovery.exportCsv');
      });
      panel.onDidDispose(() => { panel = undefined; controller?.abort(); });
    }
    refresh();
  };
  const runScan = async (discoverer, { resume = false } = {}) => {
    if (controller) {
      scanWarning = true;
      show();
      return;
    }
    const settings = readScanSettings(vscode.workspace.getConfiguration('deviceDiscovery'), discoverers);
    const selectedDiscoverers = discoverer ? [discoverer] : settings.enabledDiscoverers;
    if (!selectedDiscoverers.length) {
      vscode.window.showInformationMessage('No discoverers are enabled for Scan for All Devices. Enable one in Device Discovery settings.');
      return;
    }
    const adapters = listAdapters();
    let selected;
    if (resume && activeAdapterName) {
      selected = adapters.find(adapter => adapter.name === activeAdapterName);
      if (!selected) {
        status = `Adapter ${activeAdapterName} is unavailable or has no IPv4 address. Reconnect it or start a new scan from the Command Palette to choose another.`;
        refresh();
        return;
      }
    } else {
      selected = adapters.find(adapter => adapter.name === nextAdapter?.name)
        ?? await selectAdapter(vscode, adapters, { lastName: context.globalState.get('adapterName') });
      if (!selected || controller) return;
      await context.globalState.update('adapterName', selected.name);
      if (controller) return;
      nextAdapter = undefined;
    }
    activeAdapterName = selected.name;
    const previousDevices = resume ? sortDevices(devices, { preserveOrder: scanControl?.preserveOrder }) : [];
    scanWarning = false;
    controller = new AbortController();
    scanControl = { id: randomUUID(), continuous: settings.duration === 0, running: true, stopping: false, preserveOrder: resume };
    activeDiscoverer = discoverer;
    devices = previousDevices;
    status = `Scanning ${selected.name} (${selected.address}) — ${scanControl.continuous ? 'continuous' : `${settings.duration / 1000} seconds`}…`;
    show();
    try {
      const result = await scanDiscoverers(selectedDiscoverers, selected, { signal: controller.signal, duration: settings.duration,
        discovererOptions: settings.discovererOptions,
        log: message => output.appendLine(message),
        onDevice: results => { devices = resume ? mergeDevices(devices, results) : results; refresh(); } });
      devices = resume ? mergeDevices(devices, result.devices) : result.devices;
      status = controller.signal.aborted ? `Scan ${scanControl.continuous ? 'stopped' : 'cancelled'}; showing responses received so far.`
        : `Scan complete on ${selected.address}. ${devices.length} device(s) found.`;
      if (result.errors.length) {
        status += ` Errors: ${result.errors.map(error => `${error.discoverer}: ${error.message}`).join('; ')}`;
      }
      output.appendLine(status);
    } catch (error) {
      status = `Scan failed: ${error.message}`;
      output.appendLine(status);
    } finally { controller = undefined; scanWarning = false; scanControl.running = false; scanControl.stopping = false; refresh(); }
  };
  const exportCsv = async () => {
    if (!devices.length) { vscode.window.showInformationMessage('No results to export. Run a discovery scan first.'); return; }
    // Snapshot before the dialog so a continuous scan or a new scan cannot
    // change the exported table while the user is choosing a filename.
    const csv = toCsv(devices, activeDiscoverer, { preserveOrder: scanControl?.preserveOrder });
    const name = defaultFilename(activeDiscoverer?.id ?? 'all');
    const destination = await vscode.window.showSaveDialog({
      title: 'Export discovery results to CSV', saveLabel: 'Export',
      filters: { 'CSV files': ['csv'] }, defaultUri: vscode.Uri.file(path.join(os.homedir(), name)),
    });
    if (!destination) return;
    await vscode.workspace.fs.writeFile(destination, Buffer.from(csv, 'utf8'));
    output.appendLine(`Exported results to ${destination.fsPath}`);
  };
  const chooseAdapter = async () => {
    const selected = await selectAdapter(vscode, listAdapters(), { force: true,
      lastName: context.globalState.get('adapterName') });
    if (selected) {
      nextAdapter = selected;
      await context.globalState.update('adapterName', selected.name);
    }
  };
  const command = (id, handler) => vscode.commands.registerCommand(id, async () => {
    try { await handler(); }
    catch (error) { vscode.window.showErrorMessage(error.message); }
  });
  context.subscriptions.push(output,
    ...discoverers.map(discoverer => command(discoverer.command, () => runScan(discoverer))),
    command('deviceDiscovery.scanAll', () => runScan()),
    command('deviceDiscovery.selectAdapter', chooseAdapter),
    command('deviceDiscovery.show', show),
    command('deviceDiscovery.exportCsv', exportCsv),
    { dispose() { controller?.abort(); panel?.dispose(); } });
};

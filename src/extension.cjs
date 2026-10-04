const vscode = require('vscode');
const { render } = require('./table.cjs');
const { readScanSettings, selectAdapter } = require('./settings.cjs');

exports.activate = async context => {
  const { listAdapters } = await import('./adapters.mjs');
  const { discoverers, importCapture } = await import('./registry.mjs');
  const { scanDiscoverers } = await import('./manager.mjs');
  const output = vscode.window.createOutputChannel('Device Discovery');
  let panel, controller, activeDiscoverer, nextAdapter, devices = [], status = 'Run a scan or open a saved capture to view devices.';
  const refresh = () => { if (panel) panel.webview.html = render(devices, status, activeDiscoverer); };
  const show = () => {
    const title = activeDiscoverer ? `${activeDiscoverer.name} Devices` : 'All Devices';
    if (panel) { panel.title = title; panel.reveal(); }
    else {
      panel = vscode.window.createWebviewPanel('deviceDiscovery', title, vscode.ViewColumn.One, { localResourceRoots: [] });
      panel.onDidDispose(() => { panel = undefined; });
    }
    refresh();
  };
  const runScan = async discoverer => {
    if (controller) { vscode.window.showInformationMessage('A device discovery scan is already running.'); return; }
    const settings = readScanSettings(vscode.workspace.getConfiguration('deviceDiscovery'), discoverers);
    const selectedDiscoverers = discoverer ? [discoverer] : settings.enabledDiscoverers;
    if (!selectedDiscoverers.length) {
      vscode.window.showInformationMessage('No discoverers are enabled for Scan for All Devices. Enable one in Device Discovery settings.');
      return;
    }
    const adapters = listAdapters();
    const selected = adapters.find(adapter => adapter.name === nextAdapter?.name)
      ?? await selectAdapter(vscode, adapters, { lastName: context.globalState.get('adapterName') });
    if (!selected || controller) return;
    await context.globalState.update('adapterName', selected.name);
    if (controller) return;
    nextAdapter = undefined;
    controller = new AbortController();
    activeDiscoverer = discoverer;
    devices = [];
    status = `Scanning ${selected.name} (${selected.address})…`;
    show();
    try {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
        title: `Discovering ${discoverer?.name ?? 'all'} devices (${settings.duration === 0 ? 'continuous — cancel to stop' : `${settings.duration / 1000} seconds`})`, cancellable: true }, async (_, token) => {
        const cancellation = token.onCancellationRequested(() => controller?.abort());
        try {
          if (token.isCancellationRequested) controller.abort();
          const result = await scanDiscoverers(selectedDiscoverers, selected, { signal: controller.signal, duration: settings.duration,
            discovererOptions: settings.discovererOptions,
            log: message => output.appendLine(message),
            onDevice: results => { devices = results; refresh(); } });
          devices = result.devices;
          status = controller.signal.aborted ? 'Scan cancelled; showing responses received so far.'
            : `Scan complete on ${selected.address}. ${devices.length} device(s) found.`;
          if (result.errors.length) {
            status += ` Errors: ${result.errors.map(error => `${error.discoverer}: ${error.message}`).join('; ')}`;
            vscode.window.showWarningMessage(status);
          }
          output.appendLine(status);
        } finally { cancellation.dispose(); }
      });
    } catch (error) {
      status = `Scan failed: ${error.message}`;
      output.appendLine(status);
      vscode.window.showErrorMessage(status);
    } finally { controller = undefined; refresh(); }
  };
  const openCapture = async () => {
    if (controller) { vscode.window.showInformationMessage('Finish or cancel the scan before opening a capture.'); return; }
    const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Discovery capture': ['json'] } });
    if (!files || controller) return;
    try {
      const capture = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(files[0])).toString('utf8'));
      const imported = importCapture(capture);
      if (controller) return;
      activeDiscoverer = imported.discoverer;
      devices = imported.devices;
      status = `Saved capture from ${capture.localAddress ?? 'unknown adapter'}; these are historical results.`;
      show();
    } catch (error) { vscode.window.showErrorMessage(`Cannot open capture: ${error.message}`); }
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
    command('deviceDiscovery.import', openCapture),
    { dispose() { controller?.abort(); panel?.dispose(); } });
};

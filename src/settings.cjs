exports.readScanSettings = (configuration, discoverers) => {
  const seconds = configuration.get('scanDuration', 5);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) {
    throw new Error('Device Discovery scan duration must be a whole number from 1 to 300 seconds.');
  }
  return {
    duration: seconds * 1000,
    enabledDiscoverers: discoverers.filter(discoverer =>
      configuration.get(`discoverers.${discoverer.id}.enabled`, true) !== false),
  };
};

exports.selectAdapter = async (vscode, adapters, { force = false, lastName } = {}) => {
  const configuration = vscode.workspace.getConfiguration('deviceDiscovery');
  const defaultName = configuration.get('defaultAdapter', '').trim();
  const saved = adapters.find(adapter => adapter.name === defaultName);
  if (saved && !force) return saved;
  if (!adapters.length) throw new Error('No local IPv4 network adapters found.');
  const preferred = saved?.name ?? lastName;
  const sorted = [...adapters].sort((a, b) => Number(b.name === preferred) - Number(a.name === preferred));
  const selected = await vscode.window.showQuickPick(sorted.map(adapter => ({
    label: adapter.name, description: `${adapter.address} · ${adapter.netmask}${adapter.name === defaultName ? ' · default' : ''}`, adapter,
  })), { title: defaultName && !saved
    ? `Default adapter ${defaultName} is unavailable — select an adapter`
    : 'Select the network adapter connected to your devices' });
  if (!selected) return;
  if (selected.adapter.name !== defaultName) {
    const answer = await vscode.window.showQuickPick([
      { label: 'Use as Default', description: 'Save this adapter for future scans', save: true },
      { label: 'Use Once', description: 'Use this adapter without changing the default', save: false },
    ], { title: `Use ${selected.adapter.name} (${selected.adapter.address}) as the default adapter?`,
      ignoreFocusOut: true });
    if (!answer) return;
    if (answer.save) {
      await configuration.update('defaultAdapter', selected.adapter.name, vscode.ConfigurationTarget.Global);
    }
  }
  return selected.adapter;
};

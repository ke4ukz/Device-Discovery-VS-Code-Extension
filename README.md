# Device Discovery

A desktop VS Code extension with a central manager and protocol-specific
discoverers. Crestron is the first supported protocol. Its detailed table shows
hostname, model, IP address, Serial Number/TSID, firmware, MAC address, and build
date. Each future discoverer can define its own columns.

## Run locally

1. Open this repository folder in desktop VS Code.
2. Press **F5** and select **Run Device Discovery**. A separate Extension
   Development Host window opens. No dependency installation or build is needed.
3. In that window's Command Palette, run **Device Discovery: Scan for Crestron Devices**.
4. Select the adapter connected to the devices (currently `10.0.1.69`). Choose
   **Use as Default** to reuse it automatically, or **Use Once** for this scan.

The scan defaults to five seconds and can be cancelled from its progress notification.
Results update as packets arrive and duplicate responses are combined by MAC.
**Device Discovery: Scan for All Devices** runs all registered discoverers
concurrently and shows Discoverer, IP Address, and optional Hostname/MAC Address.
Currently this runs only Crestron; it is not a general scan of every IP address.
Results from different discoverers remain separate even if their IP matches.
A failed discoverer reports an error while the others continue.
Each new scan replaces previous results. Select table text to copy it.

Use **Device Discovery: Open Capture** to inspect a JSON file from `captures/`
without network access, or **Show Devices** to reopen the current table. Open
**View → Output → Device Discovery** for network diagnostics.

## Settings

Open VS Code Settings and search for **Device Discovery** (or
`@ext:device-discovery` when the extension is loaded). These are normal VS Code
settings; changes apply to the next scan.

- **Scan Duration** (`deviceDiscovery.scanDuration`): 1–300 seconds, default 5.
- **Default Adapter** (`deviceDiscovery.defaultAdapter`): adapter name (for example,
  `en0`), resolved to its current IPv4 address at scan time;
  empty means ask when scanning. This is a machine-specific user setting.
- **Discoverers: Crestron: Enabled**
  (`deviceDiscovery.discoverers.crestron.enabled`): include Crestron in **Scan for
  All Devices**, enabled by default. Direct Crestron scans remain available.
  Each added discoverer gets its own checkbox here. If all are disabled,
  Scan for All explains that a discoverer needs to be enabled.

Run **Device Discovery: Select Adapter** to select an adapter and optionally
save it as the default. **Use Once** applies to the next scan. If a saved adapter
is no longer present or has no IPv4 address, scanning asks for another; it never silently scans
another interface. Clear **Default Adapter** to return to choosing every scan.

## Network behavior

Queries use UDP port `41794` and both limited and subnet broadcasts. Adapter
selection is explicit; the extension never changes your network configuration.
Devices on other IP subnets may not reply, even when connected to the same switch.
An empty result does not establish that a device is absent. Close other discovery
tools if the UDP port is already occupied.

The extension runs on the local desktop, including with remote workspaces.
Browser-only VS Code is unsupported. IPv6 experiments remain in the standalone
[probe](tools/README.md); IPv6 discovery is not enabled in the extension.

Serial Number/TSID retains the reported `#`, `%`, or `$` prefix without conversion.
The parser is validated against captured RMC4, TSW-1060, TSW-560P, and MPC3-101
responses. Unknown detail formats remain visible as raw text.

## Development

```sh
npm test
npm run check
```

Tests exercise parsing, response variants, deduplication, scan cancellation,
socket errors, and safe rendering. Live hardware and VS Code UI validation must
be performed separately. Captures and the supplied reference script are ignored
by Git; keep identifying device information out of committed fixtures.

## Adding a discoverer

1. Add a module under `src/discoverers/` exporting `id`, `name`, `command`,
   `columns` (field/label pairs), and `scan(adapter, options)`.
2. Register the object in `src/registry.mjs` and its Command Palette title in
   `package.json`, using `Device Discovery: Scan for <Name> Devices`. Add a boolean
   `deviceDiscovery.discoverers.<id>.enabled` setting, defaulting to true, so it
   appears in Settings and participates in the Scan for All enabled list.
3. Add fixtures and tests for its packets, socket lifecycle, and optional fields.

`scan` receives `signal`, `duration`, `onDevice`, and `log`. It returns a promise
of device records and calls `onDevice` with the current complete result list as
responses arrive. Each record requires `ip`; `hostname`, `macAddress`, and
`details` are optional. Additional fields map to that discoverer's custom columns.
The manager adds `discovererId` and `discoverer` to every result. Protocols own
their sockets, multicast memberships, timers, and cleanup on completion,
cancellation, or errors. Preserve raw details when possible. An optional
`parseCapture(packet)` enables saved capture viewing; new captures should include
`discovererId`. Older captures default to Crestron.

`src/manager.mjs` orchestrates parallel scans and isolates errors;
`src/extension.cjs` handles VS Code commands and adapter selection;
`src/table.cjs` renders escaped text using registry-defined columns. Protocol
logic should not depend on VS Code. Ordinary UDP multicast and mDNS can be added
with Node sockets; no packet capture is implemented. Shared protocols such as
mDNS should use one shared transport if multiple discoverers need the same port.
The current adapter picker supplies IPv4 addresses; a future IPv6 discoverer
will need adapter selection extended to supply scoped IPv6 addresses as well.

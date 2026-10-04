# Device Discovery

A desktop VS Code extension with a central manager and protocol-specific
discoverers. Crestron and mDNS/DNS-SD are supported. The Crestron table shows
hostname, model, IP address, Serial Number/TSID, firmware, MAC address, and build
date. Each future discoverer can define its own columns.

## Run locally

1. Open this repository folder in desktop VS Code.
2. Press **F5** and select **Run Device Discovery**. A separate Extension
   Development Host window opens. No dependency installation or build is needed.
3. In that window's Command Palette, run **Device Discovery: Scan for Crestron Devices**.
4. Select the adapter connected to the devices. Choose
   **Use as Default** to reuse it automatically, or **Use Once** for this scan.

The scan defaults to five seconds and can be cancelled from its progress notification.
Results update as packets arrive and duplicate responses are combined by MAC.
**Device Discovery: Scan for All Devices** runs all registered discoverers
concurrently and shows Discoverer, IP Address, and optional Hostname/MAC Address.
Currently this runs Crestron and mDNS; it is not a general scan of every IP address.
Results from different discoverers remain separate even if their IP matches.
A failed discoverer reports an error while the others continue.
Each new scan replaces previous results. Select table text to copy it.

Use **Device Discovery: Open Capture** to inspect a JSON file from `captures/`
without network access, or **Show Devices** to reopen the current table. Open
**View → Output → Device Discovery** for network diagnostics.

## Development launch setup

The local `.vscode/` folder is excluded from Git. For a fresh clone, create
`.vscode/launch.json` with this configuration, then press F5:

```json
{
  "version": "0.2.0",
  "configurations": [{
    "name": "Run Device Discovery",
    "type": "extensionHost",
    "request": "launch",
    "args": ["--extensionDevelopmentPath=${workspaceFolder}"]
  }]
}
```

## Settings

Open VS Code Settings and search for **Device Discovery** . These are normal VS Code
settings; changes apply to the next scan.

- **Scan Duration** (`deviceDiscovery.scanDuration`): 1–300 seconds, default 5.
- **Default Adapter** (`deviceDiscovery.defaultAdapter`): adapter name (for example,
  `en0`), resolved to its current IPv4 address at scan time;
  empty means ask when scanning. This is a machine-specific user setting.
- **Discoverers: Crestron: Enabled**
  (`deviceDiscovery.discoverers.crestron.enabled`): include Crestron in **Scan for
  All Devices**, enabled by default. Direct Crestron scans remain available.
  **Discoverers: mDNS: Enabled** (`deviceDiscovery.discoverers.mdns.enabled`)
  similarly controls mDNS inclusion. Both are enabled by default.
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
probe under `tools/` (in the source checkout); IPv6 discovery is not enabled in the extension.

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

## mDNS discovery

Run **Device Discovery: Scan for mDNS Devices** and choose an adapter connected
to a home or office network with advertised services. The table displays service
name, service type, hostname, IPv4 address, port, and TXT records. A host may
advertise several services, so several rows can share an IP. mDNS records do not
normally supply a MAC address; the summary leaves that field blank.

The discoverer browses `_services._dns-sd._udp.local.` to enumerate service types,
then resolves PTR, SRV, TXT, and A records. It also directly queries HTTP, HTTPS,
SSH, Shure, and the Dante service types from the supplied Python example. This
can discover printers and other DNS-SD services beyond the original fixed list.
Only services that advertise an IPv4 address are displayed in this first version;
a device being connected does not mean it advertises an mDNS service.

The socket shares UDP port 5353 and joins `224.0.0.251` on the selected adapter;
outgoing multicast uses that adapter's current IPv4 address. It uses ordinary
UDP, requires no packet-sniffing driver, and closes when the configured scan
ends or is cancelled. Bonjour, firewall rules, and multicast filtering can affect
live results; inspect the Device Discovery Output channel for socket errors.
Five seconds is a starting point; increase Scan Duration if service resolution
needs more time. Current capture import supports the original Crestron packet
format only; mDNS capture import has not been added.

Protocol references: [mDNS (RFC 6762)](https://www.rfc-editor.org/rfc/rfc6762.html)
and [DNS-SD (RFC 6763)](https://www.rfc-editor.org/rfc/rfc6763.html).

### Filter mDNS services

In Settings, edit **Device Discovery → mDNS: Service Types**. An empty list
shows all discovered service types. Add `_http` and `_ssh` to show just those
services, or `_http._tcp.local` to match one exact service/transport. Short names
match both TCP and UDP. Matching is case-insensitive; full types may have a
trailing dot. The filter applies to direct mDNS scans and Scan for All, leaving
other discoverers' results unchanged. Changes apply to the next scan.

Equivalent settings JSON:

```json
"deviceDiscovery.mdns.serviceTypes": ["_http", "_ssh"]
```

The scan still enumerates available service types, and directly queries the
configured types so they can be found even if a device omits enumeration replies.
Only advertised services with resolved IPv4 addresses are shown; this is not a
port scanner or a guarantee of finding every service on the network.

## Package and install

Run from the repository root with Node.js 20 or later and npm:

```sh
npm run package
```

This downloads/runs Microsoft's `@vscode/vsce` packaging tool, runs syntax checks
and tests, and produces a `.vsix` without publishing it. Runtime code has no npm
dependencies. Only `src/`, the extension manifest, README, changelog, and a license
file if present are included; captures, examples, tests, tools, and local notes
are excluded.

The extension is named **Device Discovery** (`device-discovery`). Before the
first VSIX release, set the intended `publisher` and release `version` in
`package.json`. The publisher must be the intended
identifier; folder names do not determine extension identity. A Marketplace
release also needs the chosen licensing and repository metadata. After creating
the GitHub repository, set `repository` to its actual URL in `package.json`; no
remote is currently configured. Publisher and licensing have not been finalized.

To install locally, open VS Code's Extensions view, use its **…** menu, choose
**Install from VSIX…**, and select the generated file. Windows and Linux support
remain unverified; Crestron and mDNS were tested live on macOS. See
[Microsoft's packaging guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

# Development

Contributor instructions for Device Discovery. Installation, scanning, and settings are covered in [README.md](README.md).

## Run the extension locally

Open this repository in desktop VS Code. No runtime dependency installation or compiler is required. The local `.vscode/` folder is excluded from Git; create `.vscode/launch.json` with this configuration:

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

Press **F5** and select **Run Device Discovery**. In the new Extension Development Host window, use the Command Palette to run a discovery command. Restart the debug session after changing extension code or settings declarations. Installed VSIX users do not need a launch configuration.

## Checks

```sh
npm test
npm run check
```

Tests exercise parsing, response variants, deduplication, scan cancellation, socket errors, and safe rendering. Live hardware and VS Code UI validation must be performed separately. Captures and the supplied reference script are ignored by Git; keep identifying device information out of committed fixtures.

## Adding a discoverer

1. Add a module under `src/discoverers/` exporting `id`, `name`, `command`, `columns` (field/label pairs), and `scan(adapter, options)`.
2. Register the object in `src/registry.mjs` and its Command Palette title in `package.json`, using `Device Discovery: Scan for <Name> Devices`. Add a boolean `deviceDiscovery.discoverers.<id>.enabled` setting, defaulting to true, so it appears in Settings and participates in the Scan for All enabled list.
3. Add fixtures and tests for its packets, socket lifecycle, and optional fields.

`scan` receives `signal`, `duration`, `onDevice`, and `log`. Duration is in milliseconds; 0 means run until cancellation. It returns a promise of device records and calls `onDevice` with the current complete result list as responses arrive. Each record requires `ip`; `hostname`, `macAddress`, and `details` are optional. Additional fields map to that discoverer's custom columns. The manager adds `discovererId` and `discoverer` to every result. Protocols own their sockets, multicast memberships, timers, and cleanup on completion, cancellation, or errors. Preserve raw details when possible. An optional `parseCapture(packet)` enables saved capture viewing; new captures should include `discovererId`. Older captures default to Crestron.

`src/manager.mjs` orchestrates parallel scans and isolates errors; `src/extension.cjs` handles VS Code commands and adapter selection; `src/table.cjs` renders escaped text using registry-defined columns. Protocol logic should not depend on VS Code. Ordinary UDP multicast and mDNS can be added with Node sockets; no packet capture is implemented. Shared protocols such as mDNS should use one shared transport if multiple discoverers need the same port. The current adapter picker supplies IPv4 addresses; a future IPv6 discoverer will need adapter selection extended to supply scoped IPv6 addresses as well.

## Protocol details

Crestron sends IPv4 limited and subnet broadcasts over UDP port `41794`. The parser handles both observed response headers and preserves identifiers prefixed with `#`, `%`, or `$` without conversion.

mDNS browses `_services._dns-sd._udp.local.` to enumerate service types and resolves PTR, SRV, TXT, and A records. It also queries HTTP, HTTPS, SSH, Shure, and the supplied Dante service types directly. Configured service filters seed additional queries. The socket shares UDP port `5353`, joins `224.0.0.251`, and sends multicast on the selected adapter. Results preserve distinct service instances at the same host and IP.

Protocol references: [mDNS (RFC 6762)](https://www.rfc-editor.org/rfc/rfc6762.html) and [DNS-SD (RFC 6763)](https://www.rfc-editor.org/rfc/rfc6763.html).

IPv6 experiments remain in the standalone probe under `tools/`; IPv6 discovery is not enabled in the extension. CDP and other packet-capture protocols are outside the current scope.

## Build a VSIX

Run from the repository root with Node.js 20 or later and npm:

```sh
npm run package
```

This downloads/runs Microsoft's `@vscode/vsce` packaging tool, runs syntax checks and tests, and produces a `.vsix` without publishing it. Runtime code has no npm dependencies. Only `src/`, the manifest, README, changelog, and license are included; development documentation, captures, examples, tests, tools, and local notes are excluded.

Before releasing, confirm `publisher` and `version` in `package.json` and inspect the generated archive. Repository, homepage, and issue links point to [the GitHub project](https://github.com/ke4ukz/Device-Discovery-VS-Code-Extension). The project uses GPLv3. Folder names do not determine extension identity.

Install the generated VSIX in a regular VS Code window and verify commands, settings, cancellation, and real device discovery. Crestron and mDNS have been tested on macOS; Windows and Linux remain unverified. Publishing to the Marketplace is a separate step. See [Microsoft's packaging guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

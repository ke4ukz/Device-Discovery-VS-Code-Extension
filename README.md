# Device Discovery

Discover network devices from desktop VS Code. Device Discovery currently supports Crestron devices and mDNS/DNS-SD services, with separate detailed tables and a combined summary view.

## Install

In VS Code's Extensions view, open the **…** menu, choose **Install from VSIX…**, and select the downloaded `.vsix` file. You do not need Node.js, the source repository, or a `launch.json` to use the installed extension.

Crestron and mDNS discovery have been tested on macOS. Windows and Linux remain unverified. Browser-only VS Code is unsupported.

## Scan for devices

1. Open the Command Palette (**Cmd+Shift+P** on macOS, **Ctrl+Shift+P** on Windows/Linux).
2. Run **Device Discovery: Scan for Crestron Devices**, **Scan for mDNS Devices**, or **Scan for All Devices**.
3. If prompted, select the network adapter connected to your devices. Choose **Use as Default** to reuse it or **Use Once** for this scan.

Results appear as responses arrive. Scans last five seconds by default. Set Scan Duration to **0** for continuous discovery, and use **Cancel** in the progress notification to stop. Cancelling keeps the results received so far. Each new scan replaces the previous results.

**Scan for All Devices** runs all enabled discoverers concurrently. It discovers supported advertised protocols rather than probing every IP address. A failed discoverer reports its error while the others continue.

## Results

- **Crestron:** hostname, model, IP address, Serial Number/TSID, firmware, MAC address, and firmware build date. Serial Number/TSID preserves the reported `#`, `%`, or `$` prefix without conversion. Repeated responses are combined by MAC address.
- **mDNS:** service name, service type, hostname, IP address, port, and TXT records. A host can advertise several services, so multiple rows may share an IP address. MAC addresses are generally unavailable through mDNS.
- **All Devices:** discoverer, IP address, and hostname/MAC address when available. Results from different discoverers stay separate even when their IP addresses match.

Select table text to copy it. Individual discoverer tables also include expandable raw details. Run **Device Discovery: Show Devices** to reopen the current results.

**Device Discovery: Open Capture** opens a previously saved Crestron discovery JSON file without scanning. These results are historical. mDNS capture import is not currently supported.

## Settings

Open VS Code Settings and search for **Device Discovery**. Changes apply to the next scan.

| Setting | Behavior |
| --- | --- |
| **Scan Duration** | Whole seconds, default **5**. Set **0** to scan until cancelled. Positive values have no configured upper limit. |
| **Default Adapter** | Adapter name, such as `en0`, `Ethernet`, or `Wi-Fi`. Its current IPv4 address is looked up for each scan. Leave empty to choose when scanning. |
| **Discoverers: Crestron: Enabled** | Include Crestron in **Scan for All Devices**. Enabled by default. |
| **Discoverers: mDNS: Enabled** | Include mDNS in **Scan for All Devices**. Enabled by default. |
| **mDNS: Service Types** | Limit mDNS results to selected service types. An empty list shows all discovered services. |

Disabling a discoverer affects **Scan for All Devices**; its individual scan command remains available. If all discoverers are disabled, Scan for All asks you to enable one.

### Choose a default adapter

Run **Device Discovery: Select Adapter** to pick an adapter and optionally save it. **Use Once** applies to the next scan. A saved adapter continues working when its IP address changes. If it is unavailable or has no IPv4 address, you are asked to select another. Clear **Default Adapter** to choose an adapter for every scan.

### Filter mDNS services

Add `_http` and `_ssh` under **mDNS: Service Types** to show only those services. Short names match either TCP or UDP; a full type such as `_http._tcp.local` matches that specific transport. Matching is case-insensitive, and full types may have a trailing dot.

Equivalent settings JSON:

```json
{
  "deviceDiscovery.mdns.serviceTypes": ["_http", "_ssh"]
}
```

The filter applies to mDNS results in both individual and combined scans. Other discoverers are unaffected. Leave the list empty to show every discovered service type.

## Troubleshooting

Choose the adapter connected to the devices you want to find. Devices on a different subnet may not reply even if connected to the same switch. An empty scan does not prove that a device is absent.

mDNS shows advertised services with resolved IPv4 addresses. A connected device may not advertise any services. Increase Scan Duration if service resolution needs more time, and check your service filter if expected services are missing. IPv6 discovery is not currently supported.

Firewalls, multicast filtering, and other discovery applications can affect results. Close competing discovery tools if a port is occupied. Open **View → Output → Device Discovery** for error messages and network diagnostics.

## Development

For running from source, automated checks, adding discoverers, and building releases, see [DEVELOPMENT.md](DEVELOPMENT.md).

## License

Device Discovery is licensed under the GNU General Public License, version 3 (GPLv3). See [LICENSE](LICENSE) for the full terms.

## AI Disclosure

This tool was adapted to TypeScript as a VS Code extension with the assistance of an AI agent from a project that was created before AI agent coding was a thing.

## Manufacturer affiliation

Device Discovery is an independent project and is not affiliated with, endorsed by, or sponsored by any manufacturer whose devices it discovers. Manufacturer names, product names, and trademarks belong to their respective owners and are used solely to identify supported devices and protocols.

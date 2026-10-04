# Device Discovery

Discover network devices from desktop VS Code. Device Discovery currently supports Crestron devices, mDNS/DNS-SD services, and Global Caché/AMX-compatible discovery beacons, with separate detailed tables and a combined summary view.

## Scan for devices

1. Open the Command Palette (**Cmd+Shift+P** on macOS, **Ctrl+Shift+P** on Windows/Linux).
2. Run **Device Discovery: Scan for Crestron Devices**, **Scan for mDNS Devices**, **Scan for Global Caché Devices**, **Scan for AMX Discovery Devices**, or **Scan for All Devices**.
3. If prompted, select the network adapter connected to your devices. Choose **Use as Default** to reuse it or **Use Once** for this scan.

Results appear as responses arrive. Scans last five seconds by default. Set Scan Duration to **0** for continuous discovery, and use **Stop** on the results page to finish. Timed scans show **Cancel** instead. Stopping or cancelling keeps the results received so far. Closing the results page also stops an active scan. Use **Refresh Scan** after a timed scan or **Start** after stopping a continuous scan to run the same discovery method again using the same adapter, with its current IP address. These buttons keep existing results, update matching devices, and append newly found devices. Other scan settings are read again when restarting. Scans launched from the Command Palette select an adapter as usual and replace the previous results.

**Scan for All Devices** runs all enabled discoverers concurrently. It discovers supported advertised protocols rather than probing every IP address. A failed discoverer reports its error while the others continue.

## Results

- **Crestron:** hostname, model, IP address, Serial Number/TSID, firmware, MAC address, and firmware build date. Serial Number/TSID preserves the reported `#`, `%`, or `$` prefix without conversion. Repeated responses are combined by MAC address.
- **mDNS:** service name, service type, hostname, IP address, port, and TXT records. A host can advertise several services, so multiple rows may share an IP address. MAC addresses are generally unavailable through mDNS.
- **Global Caché:** Global Caché beacons, showing manufacturer, model, IP address, revision, UUID, and other reported fields, including MAC address when identifiable from the UUID.
- **AMX Discovery:** AMX-compatible beacons from other manufacturers, with the same detailed columns. Global Caché devices appear only in their own category. This finds devices advertising the protocol, rather than every AMX device.
- **All Devices:** discoverer, IP address, and hostname/MAC address when available. Results from different discoverers stay separate even when their IP addresses match.

Select table text to copy it. Individual discoverer tables also include expandable raw details. Run **Device Discovery: Show Devices** to reopen the current results.

Click **Export CSV** on the results page or run **Device Discovery: Export Results to CSV** to save the current results using the same columns and row order as the table. Choose a filename in the save dialog. You can export completed, cancelled, or running scans; during a running scan, the export captures the results available when you invoke the command. CSV files use UTF-8 and preserve commas, quotes, and multiline values.

## Settings

Open VS Code Settings and search for **Device Discovery**. Changes apply to the next scan.

| Setting | Behavior |
| --- | --- |
| **Scan Duration** | Whole seconds, default **5**. Set **0** to scan until cancelled. Positive values have no configured upper limit. |
| **Default Adapter** | Adapter name, such as `en0`, `Ethernet`, or `Wi-Fi`. Its current IPv4 address is looked up for each scan. Leave empty to choose when scanning. |
| **Discoverers: Crestron: Enabled** | Include Crestron in **Scan for All Devices**. Enabled by default. |
| **Discoverers: mDNS: Enabled** | Include mDNS in **Scan for All Devices**. Enabled by default. |
| **Discoverers: Global Cache: Enabled** | Include Global Caché in **Scan for All Devices**. Enabled by default. |
| **Discoverers: AMX: Enabled** | Include other AMX-compatible devices in **Scan for All Devices**. Enabled by default. |
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

Global Caché and AMX discovery listen for periodic announcements. Some devices announce only every 10–60 seconds, so a five-second scan can miss them. Use continuous scanning or allow at least 65 seconds. Scan for All shares one listener between these categories and assigns each beacon to one category.

Firewalls, multicast filtering, and other discovery applications can affect results. Close competing discovery tools if a port is occupied. Open **View → Output → Device Discovery** for error messages and network diagnostics.

## Development

For running from source, automated checks, adding discoverers, and building releases, see [DEVELOPMENT.md](DEVELOPMENT.md).

## License

Device Discovery is licensed under the GNU General Public License, version 3 (GPLv3). See [LICENSE](LICENSE) for the full terms.

## AI Disclosure

This tool was adapted to JavaScript as a VS Code extension with the assistance of an AI agent from a project that was created before AI agent coding was a thing.

## Manufacturer affiliation

Device Discovery is an independent project and is not affiliated with, endorsed by, or sponsored by any manufacturer whose devices it discovers. Manufacturer names, product names, and trademarks belong to their respective owners and are used solely to identify supported devices and protocols.

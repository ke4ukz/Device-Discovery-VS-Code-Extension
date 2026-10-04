# Changelog

## 1.0.0

- Discover Crestron devices and browse mDNS/DNS-SD services.
- Run all enabled discoverers together or scan each protocol individually.
- Display protocol-specific tables and shared discovery summaries.
- Configure scan duration, including continuous scanning until cancelled, enabled discoverers, default adapter, and mDNS filters.
- Reuse adapter names when IP addresses change; prompt when unavailable.
- Export current discovery results to CSV using the displayed table columns.

Crestron and mDNS discovery have been tested on macOS. Windows and Linux have
not yet been validated. Packet-capture protocols such as CDP are not included.

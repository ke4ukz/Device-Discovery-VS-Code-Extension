# Changelog

## 1.2.0

- Update discovery results in place, preserve raw-details expansion, and defer visible updates while text is selected for copying.
- Add Q-SYS discovery using QDP device and control queries, with linked design names, redundancy roles, and separate LAN port results. Includes a dedicated scan command and a Scan for All setting.
- Receive QDP multicast announcements on port 2467 so touch panels such as the TSC-70-G3 appear alongside devices that reply unicast.

## 1.1.1

- Add Last Seen to all discovery tables, with automatically updating relative times and local dates after 24 hours.
- Show precise UTC timestamps on hover and include them in CSV exports.
- Track response times for Crestron, mDNS, Global Caché, and AMX; retain timestamps until another relevant response arrives.

## 1.1.0

- Reuse the results tab’s adapter and retain/update rows when restarting; append new devices without reordering existing rows.

- Keep scan progress and controls in the results page, with Cancel/Refresh Scan for timed scans and Stop/Start for continuous scans.

- Add Global Caché and AMX-compatible beacon discovery with separate commands and enable settings.
- Share one multicast listener during combined scans and categorize each device without duplicates.
- Show manufacturer, model, IP, MAC when available, revision, UUID, and other reported fields.

## 1.0.0

- Discover Crestron devices and browse mDNS/DNS-SD services.
- Run all enabled discoverers together or scan each protocol individually.
- Display protocol-specific tables and shared discovery summaries.
- Configure scan duration, including continuous scanning until cancelled, enabled discoverers, default adapter, and mDNS filters.
- Reuse adapter names when IP addresses change; prompt when unavailable.
- Export current discovery results to CSV using the displayed table columns.

Crestron and mDNS discovery have been tested on macOS. Windows and Linux have
not yet been validated. Packet-capture protocols such as CDP are not included.

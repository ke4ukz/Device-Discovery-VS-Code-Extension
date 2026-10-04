# Discovery probe

Run from the repository root with Node.js; no dependencies are required:

```sh
node tools/discover.mjs 10.0.1.69 10.0.1.3
```

The first argument selects the local IPv4 adapter. The optional second argument
adds a direct query to a known device. The probe also sends limited and
subnet broadcasts using the selected adapter's actual netmask.

It binds UDP port 41794, sends the reference script's 266-byte query immediately
and every five seconds, and listens for twelve seconds. Close other discovery
tools if the port is already in use.

Responses appear in the terminal and are saved under `captures/` as JSON with
sender IP, hostname, raw details, header validation, packet length, and complete
packet bytes in hexadecimal. Captures are ignored by Git. The parser extracts
model, firmware version, build date, MAC address, and `serialNumberOrTsid`
for a **Serial Number/TSID** column. Identifiers retain their `#`, `%`, or `$`
prefix; no TSID conversion is performed. Unfamiliar details are preserved.

Decode an existing capture and show one entry per IP/device:

```sh
node tools/replay.mjs captures/discovery-2026-10-03T22-50-15.539Z.json
```

A device on another subnet may receive a broadcast but be unable to send a
reply to this adapter. An empty scan does not establish that such a device is
absent.

## Experimental IPv6 probe

```sh
node tools/discover.mjs --ipv6 en0
```

This sends the same query to the link-local all-nodes multicast address
`ff02::1%en0`, using the adapter's IPv6 link-local address. This destination is
an experiment, not a documented Crestron discovery group. No responses would
not rule out IPv6 connectivity or another discovery mechanism.

To query a known IPv6 address directly, append its actual address to
`node tools/discover.mjs --ipv6 en0`. Copy the address from the neighbor list,
including its `%en0` suffix. Do not enter an example or placeholder address.

On macOS, `ping6 -c 3 'ff02::1%en0'` may reveal responding IPv6 neighbors;
`ndp -an` then lists their addresses and MAC addresses. Ping responses alone do
not identify a device as Crestron, and devices may ignore multicast ping.

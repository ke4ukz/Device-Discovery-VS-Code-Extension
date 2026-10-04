import os from 'node:os';

export function listAdapters() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
    addresses.filter(address => address.family === 'IPv4' && !address.internal)
      .map(address => ({ name, address: address.address, netmask: address.netmask })));
}

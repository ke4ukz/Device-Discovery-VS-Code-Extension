// Match the manager's identity rules while keeping protocols and service instances separate.
const deviceKey = device => JSON.stringify([device.discovererId,
  device.identity ?? device.macAddress?.toUpperCase() ?? `${device.ip}/${device.hostname ?? ''}`]);

exports.mergeDevices = (previous, incoming) => {
  const results = new Map(previous.map(device => [deviceKey(device), device]));
  for (const device of incoming) results.set(deviceKey(device), device);
  return [...results.values()];
};

const { columnsFor, sortDevices } = require('./table.cjs');

exports.defaultFilename = (method = 'all', date = new Date()) => {
  const pad = value => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${day}_${time}-device-discovery-${method}.csv`;
};

exports.toCsv = (devices, discoverer) => {
  const columns = columnsFor(discoverer);
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [columns.map(([, label]) => label),
    ...sortDevices(devices).map(device => columns.map(([field]) => device[field]))];
  // UTF-8 BOM helps spreadsheet applications recognize Unicode device names.
  return '\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
};

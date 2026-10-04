import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { crestron } from '../src/discoverers/crestron.mjs';
import { mdns } from '../src/discoverers/mdns.mjs';
const { toCsv, defaultFilename } = createRequire(import.meta.url)('../src/csv.cjs');

test('export filename uses padded local date/time and discovery method', () => {
  const date = new Date(2026, 0, 2, 3, 4, 5);
  assert.equal(defaultFilename('crestron', date), '2026-01-02_03-04-05-device-discovery-crestron.csv');
  assert.equal(defaultFilename('mdns', date), '2026-01-02_03-04-05-device-discovery-mdns.csv');
  assert.equal(defaultFilename(undefined, date), '2026-01-02_03-04-05-device-discovery-all.csv');
});

test('summary CSV uses table columns, numerical IP sorting, and empty optional fields', () => {
  const devices = [{ discoverer: 'mDNS', ip: '10.0.1.15' },
    { discoverer: 'Crestron', ip: '10.0.1.3', hostname: 'Controller' }];
  assert.equal(toCsv(devices), '\uFEFF"Discoverer","IP Address","Hostname","MAC Address"\r\n'
    + '"Crestron","10.0.1.3","Controller",""\r\n"mDNS","10.0.1.15","",""\r\n');
  assert.equal(devices[0].ip, '10.0.1.15');
});

test('CSV escapes commas, embedded quotes, multiline values, and preserves Unicode and zero', () => {
  const csv = toCsv([{ serviceName: 'Office, "北"', ip: '10.0.1.3', port: 0,
    txtRecords: 'first\nsecond\r\nthird' }], mdns);
  assert.ok(csv.startsWith('\uFEFF"Service Name","Service Type"'));
  assert.ok(csv.includes('"Office, ""北"""'));
  assert.ok(csv.includes('"0","first\nsecond\r\nthird"'));
});

test('Crestron CSV contains the complete detailed columns and reported TSID', () => {
  const csv = toCsv([{ ip: '10.0.1.3', model: 'TEST', serialNumberOrTsid: '#1234' }], crestron);
  assert.ok(csv.includes('"Serial Number/TSID","Firmware","MAC Address","Firmware Build Date"'));
  assert.ok(csv.includes('"#1234"'));
  assert.ok(!csv.includes('"Discoverer"'));
});

test('empty CSV still provides column headers', () => {
  assert.equal(toCsv([]), '\uFEFF"Discoverer","IP Address","Hostname","MAC Address"\r\n');
});

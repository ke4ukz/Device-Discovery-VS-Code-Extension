import test from 'node:test';
import assert from 'node:assert/strict';
import { scanTimer } from '../src/scan-timer.mjs';

test('zero duration never schedules an automatic stop', () => {
  const stop = scanTimer(0, () => assert.fail('Continuous scan ended'), {
    schedule: () => assert.fail('Continuous scan scheduled a deadline'),
  });
  stop();
});

test('long durations are chunked without Node timer overflow and remain cancellable', () => {
  let time = 0, callback, delay, finished = false, cancelled;
  const stop = scanTimer(3000000000, () => { finished = true; }, {
    now: () => time,
    schedule: (fn, ms) => { callback = fn; delay = ms; return 123; },
    cancel: id => { cancelled = id; },
  });
  assert.equal(delay, 2147483647);
  time = delay;
  callback();
  assert.equal(delay, 852516353);
  assert.equal(finished, false);
  time = 3000000000;
  callback();
  assert.equal(finished, true);
  stop();
  assert.equal(cancelled, 123);
});

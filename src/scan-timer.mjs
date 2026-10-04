// Node timers overflow past ~24.8 days; schedule long scans in chunks.
export function scanTimer(duration, finish, {
  now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout,
} = {}) {
  if (duration === 0) return () => {};
  const deadline = now() + duration;
  let timer;
  const next = () => {
    const remaining = deadline - now();
    if (remaining <= 0) { finish(); return; }
    timer = schedule(next, Math.min(remaining, 2147483647));
  };
  next();
  return () => cancel(timer);
}

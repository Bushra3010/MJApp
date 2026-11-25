// A random id kept on this device. The server uses it to give each device only one free call.
let cached;
export function deviceId() {
  if (cached) return cached;
  try {
    cached = localStorage.getItem('mj.device');
    if (!cached) {
      cached = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
      localStorage.setItem('mj.device', cached);
    }
  } catch { cached = cached || `nostore-${Math.random().toString(36).slice(2, 12)}`; }
  return cached;
}

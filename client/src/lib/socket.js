// Realtime connection to the Hub (Cloudflare Durable Object) over a plain WebSocket.
// Exposes a small Socket.IO-like API: on/off/emit(event, data, ack?)/disconnect, with auto-reconnect.

class RealtimeSocket {
  constructor() {
    this.handlers = new Map();
    this.pending = new Map();
    this.seq = 0;
    this.closedByUs = false;
    this.attempt = 0;
    this.connected = false;
    this.open();
  }

  open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true; this.attempt = 0; this.connected = true;
      this.ping = setInterval(() => ws.readyState === 1 && ws.send('{"t":"ping"}'), 25_000);
      this.fire('connect');
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'ev') this.fire(m.e, m.d);
      else if (m.t === 'ack') { const cb = this.pending.get(m.id); this.pending.delete(m.id); cb?.(m.d); }
    };
    ws.onclose = async (ev) => {
      clearInterval(this.ping);
      const was = this.connected; this.connected = false;
      for (const [, cb] of this.pending) cb({ error: 'Connection lost. Try again.' });
      this.pending.clear();
      if (this.closedByUs) return;
      if (ev.code === 4001) { this.fire('disconnect', 'io server disconnect'); return; }
      if (was) this.fire('disconnect', 'transport close');
      if (!opened) {
        // handshake refused: find out whether the session is gone
        const r = await fetch('/api/me', { credentials: 'same-origin' }).catch(() => null);
        if (r?.status === 401) { this.fire('connect_error', { message: 'unauthorized' }); return; }
      }
      const delay = Math.min(10_000, 500 * 2 ** this.attempt++) + Math.random() * 300;
      this.retry = setTimeout(() => this.open(), delay);
    };
  }

  fire(e, d) { for (const fn of [...(this.handlers.get(e) || [])]) { try { fn(d); } catch (err) { console.error(err); } } }
  on(e, fn) { if (!this.handlers.has(e)) this.handlers.set(e, new Set()); this.handlers.get(e).add(fn); return this; }
  off(e, fn) { this.handlers.get(e)?.delete(fn); return this; }

  emit(e, d, ack) {
    const msg = { t: 'emit', e, d };
    if (ack) { msg.id = ++this.seq; this.pending.set(msg.id, ack); }
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
    else if (ack) { this.pending.delete(msg.id); ack({ error: 'Not connected yet. Try again in a moment.' }); }
    return this;
  }

  disconnect() {
    this.closedByUs = true;
    clearTimeout(this.retry); clearInterval(this.ping);
    try { this.ws.close(1000); } catch { /* */ }
  }
}

let socket = null;
export function connectSocket() {
  if (!socket) socket = new RealtimeSocket();
  return socket;
}
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
export const getSocket = () => socket;
export const emitAck = (event, data) => new Promise((resolve) => getSocket().emit(event, data, resolve));

const PALETTE = ['#e8331c', '#ff6a2b', '#c2410c', '#d9480f', '#b5401b', '#e8590c', '#a8321a', '#f76707'];
export const initials = (n = '') => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
export const colorFor = (n = '') => PALETTE[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
export const gradFor = (n = '') => { const c = colorFor(n); return `linear-gradient(150deg, color-mix(in srgb, ${c} 75%, #fff) 0%, ${c} 45%, color-mix(in srgb, ${c} 65%, #2a0018) 100%)`; };

const WARM = [['#ff8a3d', '#e8331c', '#4a160c'], ['#f3a37c', '#c2410c', '#2e140c'], ['#ff6a2b', '#b5401b', '#331209'], ['#ffb27a', '#e8590c', '#3a1a10']];
export const warmFor = (n = '') => { const [a, b, c] = WARM[[...n].reduce((x, ch) => x + ch.charCodeAt(0), 0) % WARM.length]; return `radial-gradient(120% 90% at 50% 20%, ${a} 0%, ${b} 45%, ${c} 100%)`; };

export default function Avatar({ src, name = '', size = 48, online, busy, className = '' }) {
  return (
    <div className={`avatar ${className}`} style={{ width: size, height: size }}>
      {src
        ? <img src={src} alt="" loading="lazy" />
        : <div className="initials" style={{ background: gradFor(name), fontSize: size * 0.38 }} aria-hidden="true">{initials(name)}</div>}
      {online !== undefined && <span className={`dot ${busy ? 'busy' : online ? 'on' : ''}`} />}
    </div>
  );
}

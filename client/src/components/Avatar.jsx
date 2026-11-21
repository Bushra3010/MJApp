const PALETTE = ['#f41470', '#e0005c', '#c2185b', '#d6336c', '#b0105a', '#e64a8b', '#a3134f', '#f72585'];
export const initials = (n = '') => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
export const colorFor = (n = '') => PALETTE[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
export const gradFor = (n = '') => { const c = colorFor(n); return `linear-gradient(150deg, color-mix(in srgb, ${c} 75%, #fff) 0%, ${c} 45%, color-mix(in srgb, ${c} 65%, #2a0018) 100%)`; };

const WARM = [['#ff7ab0', '#f41470', '#4a0c26'], ['#f7a1c4', '#c2185b', '#2e0c1c'], ['#fc4c94', '#b0105a', '#33091f'], ['#ff9cc5', '#e0005c', '#3a1022']];
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

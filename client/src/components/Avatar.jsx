const PALETTE = ['#ec1c7c', '#ff5fa8', '#c2126a', '#ff7a59', '#8b3dff', '#e0459b', '#e85d75', '#b8148f'];
export const initials = (n = '') => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
export const colorFor = (n = '') => PALETTE[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
export const gradFor = (n = '') => { const c = colorFor(n); return `linear-gradient(150deg, color-mix(in srgb, ${c} 75%, #fff) 0%, ${c} 45%, color-mix(in srgb, ${c} 65%, #2a0018) 100%)`; };

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

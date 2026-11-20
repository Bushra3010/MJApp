const PALETTE = ['#ec1c7c', '#ff6aa9', '#c2126a', '#ff8a5b', '#9b5de5', '#f15bb5', '#e85d75', '#d6336c'];
export const initials = (n = '') => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
export const colorFor = (n = '') => PALETTE[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

export default function Avatar({ src, name = '', size = 48, online, busy, className = '' }) {
  return (
    <div className={`avatar ${className}`} style={{ width: size, height: size }}>
      {src
        ? <img src={src} alt="" loading="lazy" />
        : <div className="initials" style={{ background: colorFor(name), fontSize: size * 0.38 }} aria-hidden="true">{initials(name)}</div>}
      {online !== undefined && <span className={`dot ${busy ? 'busy' : online ? 'on' : ''}`} />}
    </div>
  );
}

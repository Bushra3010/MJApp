// Rotating promo cards on the host login screen.
import { useEffect, useState } from 'react';

const SLIDES = [
  { big: 'Talk & earn', sub: 'Take audio and video calls from people across India — whenever you like.', icon: '🎙️' },
  { big: 'Level up weekly', sub: 'Earn more each week to unlock higher per-minute rates.', icon: '⭐' },
  { big: 'Invite & earn 10%', sub: 'Bring other hosts and earn 10% on top of what they make.', icon: '🤝' },
];
export default function HostBanner() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 4000); return () => clearInterval(t); }, []);
  const s = SLIDES[i];
  return (
    <div className="host-banner" aria-roledescription="carousel" aria-label="Why host on Milo Julo">
      <div className="hb-slide" key={i} aria-live="polite">
        <div><small>Milo Julo Host</small><b>{s.big}</b><span>{s.sub}</span></div>
        <span className="hb-ic" aria-hidden="true">{s.icon}</span>
      </div>
      <div className="hb-dots">{SLIDES.map((_, k) => <button key={k} type="button" className={k === i ? 'on' : ''} aria-label={`Slide ${k + 1}`} aria-current={k === i} onClick={() => setI(k)} />)}</div>
    </div>
  );
}

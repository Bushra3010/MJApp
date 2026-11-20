import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import LegalFooter from '../components/LegalFooter.jsx';

function SlideToStart({ to, label }) {
  const nav = useNavigate();
  const track = useRef(null);
  const start = useRef(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const max = () => (track.current ? track.current.offsetWidth - 72 : 240);

  const down = (e) => { start.current = e.clientX - x; setDragging(true); e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => { if (dragging) setX(Math.min(max(), Math.max(0, e.clientX - start.current))); };
  const up = () => {
    setDragging(false);
    if (x > max() * 0.6 || x < 6) { setX(max()); setTimeout(() => nav(to), 220); } // a tap also starts
    else setX(0);
  };
  return (
    <div className="slide" ref={track} role="button" tabIndex={0} aria-label={label}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && nav(to)}>
      <span className={`knob ${dragging ? '' : 'anim'}`} style={{ transform: `translateX(${x}px)` }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { setDragging(false); setX(0); }}>
        <Icon name="heart" size={22} fill />
      </span>
      <span className="txt" style={{ opacity: 1 - x / (max() || 1) }}>{label}</span>
      <span className="chev"><Icon name="chevrons" size={22} /></span>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="landing hero">
      <div className="app-name">Milo Julo</div>

      <div className="collage" aria-hidden="true">
        <div className="pcard c1">
          <div className="ph"><Icon name="user" size={90} strokeWidth="1.2" style={{ color: 'rgba(60,40,30,.35)' }} /></div>
          <div className="lbl"><b>Aarav</b><small>Mumbai</small></div>
        </div>
        <div className="pcard c2">
          <div className="ph"><Icon name="user" size={90} strokeWidth="1.2" style={{ color: 'rgba(255,255,255,.4)' }} /></div>
          <div className="lbl"><b>Priya <span style={{ color: '#34c759' }}>●</span></b><small>Delhi</small></div>
        </div>
        <span className="bubble-ic b-blue"><Icon name="chat" size={20} /></span>
        <span className="bubble-ic b-violet"><Icon name="gift" size={20} /></span>
        <span className="bubble-ic b-red"><Icon name="heart" size={24} fill /></span>
      </div>

      <div style={{ width: '100%' }}>
        <h1 className="big">Find Your<br /><em>Perfect</em> Match</h1>
        <p className="sub">Meet New People, Spark Real Connections, And See Where It Goes.</p>
        <SlideToStart to="/login?mode=signup" label="Get Started" />
        <p className="alt">Already have an account? <Link to="/login">Log in</Link></p>
        <LegalFooter />
      </div>
    </div>
  );
}

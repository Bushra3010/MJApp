import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import LegalFooter from '../components/LegalFooter.jsx';

const FEATURES = [
  { icon: 'video', label: 'Video call' },
  { icon: 'phone', label: 'Audio call' },
  { icon: 'chat', label: 'Chat' },
];

export default function Landing() {
  return (
    <div className="landing">
      <img className="logo" src="/logo.png" alt="Milo Julo" />
      <h1 className="hero-title">Make new friends.<br /><span>Talk your way.</span></h1>
      <p className="tag">Video, audio and chat with real people who speak your language.</p>
      <div className="features">
        {FEATURES.map((f, i) => (
          <div key={f.label} className="card feature rise" style={{ '--i': i + 1 }}>
            <i><Icon name={f.icon} size={20} /></i>{f.label}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 10, width: '100%', maxWidth: 360 }}>
        <Link to="/login?mode=signup" className="btn btn-primary btn-block"><Icon name="sparkle" size={18} />Get started — free coins</Link>
        <Link to="/login" className="btn btn-outline btn-block">I already have an account</Link>
      </div>
      <p className="trust"><Icon name="shield" size={16} />18+ only. Every profile is verified and every report is reviewed.</p>
      <LegalFooter />
    </div>
  );
}

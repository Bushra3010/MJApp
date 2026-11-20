import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import LegalFooter from '../components/LegalFooter.jsx';

export default function Landing() {
  return (
    <div className="landing">
      <img className="logo" src="/logo.png" alt="Milo Julo" />
      <p className="tag">Make new friends. Talk your way.</p>
      <div className="features">
        <span className="chip"><Icon name="video" size={16} /> Video call</span>
        <span className="chip"><Icon name="phone" size={16} /> Audio call</span>
        <span className="chip"><Icon name="chat" size={16} /> Chat</span>
      </div>
      <div style={{ display: 'grid', gap: 10, width: '100%', maxWidth: 360 }}>
        <Link to="/login?mode=signup" className="btn btn-primary btn-block">Get started — free coins</Link>
        <Link to="/login" className="btn btn-outline btn-block">I already have an account</Link>
      </div>
      <p className="faint" style={{ marginTop: 24, maxWidth: 360 }}>18+ only. Be kind — every profile is verified and every report is reviewed.</p>
      <LegalFooter />
    </div>
  );
}

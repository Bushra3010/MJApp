import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import LegalFooter from '../../components/LegalFooter.jsx';
import { SlideToStart } from '../Landing.jsx';

const POINTS = [
  ['phone', 'Take audio & video calls', 'Go online when it suits you and answer calls from people who want to talk.'],
  ['cash', 'Earn for every minute', 'A share of every coin spent on your calls, chats and gifts. Withdraw to UPI.'],
  ['flag', 'Safe by design', 'Every member is 18+, every report is reviewed, and you can block anyone instantly.'],
];

export default function HostLanding() {
  return (
    <div className="landing hero">
      <div className="app-name">Milo Julo <span className="app-badge inline">Host</span></div>

      <div style={{ width: '100%', maxWidth: 380, margin: '28px auto 0' }}>
        <img src="/logo.png" alt="Milo Julo" style={{ width: 120, height: 120, borderRadius: 28, margin: '0 auto 22px', display: 'block' }} />
        <ul className="host-points">
          {POINTS.map(([icon, title, text]) => (
            <li key={title}>
              <span className="ic"><Icon name={icon} size={20} /></span>
              <div><b>{title}</b><span>{text}</span></div>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ width: '100%' }}>
        <h1 className="big">Talk. Connect.<br /><em>Earn.</em></h1>
        <p className="sub">Become a Milo Julo host and get paid to have great conversations.</p>
        <SlideToStart to="/login?mode=signup" label="Become a host" />
        <p className="alt">Already a host? <Link to="/login">Log in</Link></p>
        <LegalFooter />
      </div>
    </div>
  );
}

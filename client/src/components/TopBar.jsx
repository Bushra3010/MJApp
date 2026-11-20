import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Coins from './Coins.jsx';

export default function TopBar({ title, right }) {
  const { user } = useAuth();
  return (
    <header className="topbar">
      <img className="brand" src="/icon-192.png" alt="" />
      <h1>{title}</h1>
      <div className="spacer" />
      {right ?? (user?.role === 'user' && (
        <Link to="/app/wallet" className="chip" style={{ fontSize: 14, padding: '6px 12px' }} aria-label="Wallet balance"><Coins value={user.coins} /></Link>
      ))}
    </header>
  );
}

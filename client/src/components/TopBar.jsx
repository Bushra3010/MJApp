import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Coins from './Coins.jsx';
import Icon from './Icon.jsx';

export default function TopBar({ title, right, logo = true }) {
  const { user } = useAuth();
  return (
    <header className="topbar">
      {logo && <img className="brand" src="/icon-192.png" alt="" />}
      <h1>{title}</h1>
      <div className="spacer" />
      {right ?? (user?.role === 'user' && (
        <Link to="/app/wallet" className="coin-pill press" aria-label={`Wallet balance ${user.coins} coins. Add coins`}>
          <Coins value={user.coins} />
          <span className="plus"><Icon name="plus" size={16} strokeWidth="3" /></span>
        </Link>
      ))}
    </header>
  );
}

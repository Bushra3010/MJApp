// Host app header: title, wallet balance pill, trophy → weekly leaderboard.
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Coins from './Coins.jsx';
import Icon from './Icon.jsx';

export default function HostTop({ title }) {
  const { user } = useAuth();
  return (
    <header className="ht-top">
      <h1>{title}</h1>
      <div className="spacer" />
      <Link to="/host/wallet" className="ht-wallet press" aria-label={`Wallet: ${user.host?.earnings ?? 0} coins`}><Icon name="wallet" size={16} /><Coins value={user.host?.earnings ?? 0} /></Link>
      <Link to="/host/leaderboard" className="ht-trophy press" aria-label="This week's leaderboard"><Icon name="trophy" size={22} /></Link>
    </header>
  );
}

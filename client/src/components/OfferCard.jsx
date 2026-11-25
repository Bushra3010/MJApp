// Always-visible recharge offer on Discover and Match; opens the recharge sheet.
import { useAuth } from '../lib/auth.jsx';
import { useRecharge } from '../lib/recharge.jsx';
import Coins from './Coins.jsx';
import Icon from './Icon.jsx';

export default function OfferCard({ style }) {
  const { user } = useAuth();
  const { openRecharge } = useRecharge();
  const low = (user?.coins ?? 0) < 30;
  return (
    <button className="offer-card press" style={style} onClick={() => openRecharge({ reason: low ? 'Your coins are running low. Recharge to keep calling.' : 'Pick a pack: coins are added instantly.' })}>
      <span className="oc-ic" aria-hidden="true">🎁</span>
      <span className="oc-txt">
        <b>{low ? 'Low balance, recharge now' : 'Recharge offer: 250 coins for ₹99'}</b>
        <span>{low ? <>You have <Coins value={user?.coins ?? 0} /> · a video call needs 30/min</> : 'Most popular pack · coins added instantly'}</span>
      </span>
      <span className="oc-go">Recharge<Icon name="chevron" size={16} /></span>
    </button>
  );
}

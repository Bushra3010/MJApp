import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import Coins from '../../components/Coins.jsx';
import Icon from '../../components/Icon.jsx';

export default function HostInvite() {
  const nav = useNavigate();
  const toast = useToast();
  const [inv, setInv] = useState(null);
  useEffect(() => { api('/host/invite').then(setInv); }, []);
  const msg = inv && `Join Milo Julo as a host and earn by talking! Use my invite code ${inv.code}: ${inv.link}`;
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Become a Milo Julo host', text: msg });
      else { await navigator.clipboard.writeText(msg); toast('Invite copied', 'success'); }
    } catch { /* cancelled */ }
  };
  if (!inv) return <div className="spinner" />;
  return (
    <>
      <header className="topbar"><button className="icon-btn press" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" /></button><h1>Invite & earn</h1></header>
      <div className="page">
        <div className="offer-card tone-blue">
          <h3>Earn {inv.pct}% from your invites</h3>
          <p>When a host joins with your code, you earn {inv.pct}% of everything they earn — paid by Milo Julo, not taken from them.</p>
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <span className="faint">Your invite code</span>
          <div className="invite-code" aria-label={`Invite code ${inv.code.split('').join(' ')}`}>{inv.code}</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => navigator.clipboard.writeText(inv.link).then(() => toast('Link copied', 'success'))}>Copy link</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={share}><Icon name="share" size={18} /> Share</button>
          </div>
          <a className="btn btn-green btn-block" style={{ marginTop: 8 }} href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
        </div>
        <div className="h-stats two" style={{ marginTop: 12 }}>
          <div className="card stat"><b>{inv.invited}</b><span>Hosts joined</span></div>
          <div className="card stat"><b><Coins value={inv.earned} /></b><span>Earned from invites</span></div>
        </div>
      </div>
    </>
  );
}

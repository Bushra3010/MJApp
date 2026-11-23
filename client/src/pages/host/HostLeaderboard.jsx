import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import Avatar from '../../components/Avatar.jsx';
import Coins from '../../components/Coins.jsx';
import Icon from '../../components/Icon.jsx';

const MEDAL = ['🥇', '🥈', '🥉'];
export default function HostLeaderboard() {
  const nav = useNavigate();
  const [lb, setLb] = useState(null);
  useEffect(() => { api('/host/leaderboard').then(setLb); }, []);
  return (
    <>
      <header className="topbar"><button className="icon-btn press" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" /></button><h1>This week's top 10</h1></header>
      <div className="page">
        <p className="muted" style={{ marginBottom: 12 }}>Top earners this week (Monday–Sunday) can win the weekly bonus.</p>
        {lb?.myRank && <div className="card" style={{ padding: 14, marginBottom: 12 }}>Your rank: <b>#{lb.myRank}</b> · <Coins value={lb.myEarned} /> this week</div>}
        {!lb ? <div className="spinner" /> : lb.top.length === 0 ? <div className="empty"><div className="big">🏆</div><b>No earnings yet this week</b><p>Be the first on the board.</p></div> : lb.top.map((r) => (
          <div key={r.id} className={`list-row ${r.me ? 'lb-me' : ''}`}>
            <span className="lb-rank">{MEDAL[r.rank - 1] || `#${r.rank}`}</span>
            <Avatar src={r.avatar} name={r.name} size={44} />
            <div className="txt"><b>{r.name}{r.me ? ' (you)' : ''}</b></div>
            <Coins value={r.earned} />
          </div>
        ))}
      </div>
    </>
  );
}

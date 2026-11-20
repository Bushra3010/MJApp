import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, mmss, timeAgo } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

const label = { ended: '', missed: 'Missed', declined: 'Declined', failed: 'Failed', ringing: 'Ringing', active: 'Live' };
export default function CallHistory() {
  const [calls, setCalls] = useState(null);
  const { user } = useAuth();
  const nav = useNavigate();
  useEffect(() => { api('/calls').then(setCalls); }, []);
  return (
    <>
      <header className="topbar"><button className="icon-btn press" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" /></button><h1>Call history</h1></header>
      <div className="page">
        {!calls ? <div className="spinner" /> : calls.length === 0 ? <div className="empty"><div className="big">📞</div><b>No calls yet</b></div> : calls.map((c) => (
          <div key={c.id} className="list-row">
            <Avatar src={c.other_avatar} name={c.other_name} size={48} />
            <div className="txt"><b>{c.other_name}</b>
              <span><Icon name={c.type === 'video' ? 'video' : 'phone'} size={14} /> {c.status === 'ended' ? mmss(c.seconds) : label[c.status]} · {timeAgo(c.created_at)}</span></div>
            {c.coins_charged > 0 && <span className={`chip ${user.role === 'host' ? 'chip-green' : ''}`}>{user.role === 'host' ? '' : '−'}{c.coins_charged} coins</span>}
          </div>
        ))}
      </div>
    </>
  );
}

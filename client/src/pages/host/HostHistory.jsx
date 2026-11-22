import { useEffect, useMemo, useState } from 'react';
import { api, mmss, timeAgo } from '../../lib/api.js';
import TopBar from '../../components/TopBar.jsx';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import Coins from '../../components/Coins.jsx';

const TABS = [['all', 'All'], ['received', 'Received'], ['missed', 'Missed']];
const MISSED = { missed: 'Missed', declined: 'Rejected', failed: 'Failed' };

export default function HostHistory() {
  const [calls, setCalls] = useState(null);
  const [tab, setTab] = useState('all');
  useEffect(() => { api('/calls').then(setCalls).catch(() => setCalls([])); }, []);
  const list = useMemo(() => (calls || []).filter((c) => (tab === 'all' ? true : tab === 'received' ? c.status === 'ended' : !!MISSED[c.status])), [calls, tab]);
  const totals = useMemo(() => (calls || []).reduce((a, c) => (c.status === 'ended' ? { n: a.n + 1, s: a.s + c.seconds, e: a.e + (c.earned || 0) } : a), { n: 0, s: 0, e: 0 }), [calls]);

  return (
    <>
      <TopBar title="Call history" right={null} />
      <div className="page">
        <div className="h-stats three">
          <div className="card stat"><b>{totals.n}</b><span>Received</span></div>
          <div className="card stat"><b>{Math.round(totals.s / 60)}</b><span>Minutes</span></div>
          <div className="card stat"><b><Coins value={totals.e} /></b><span>Earned</span></div>
        </div>
        <div className="tabs" role="tablist" aria-label="Filter calls">
          {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {!calls ? <div className="spinner" /> : list.length === 0 ? (
          <div className="empty"><div className="big">📞</div><b>{tab === 'missed' ? 'No missed calls' : 'No calls yet'}</b><p>{tab === 'missed' ? 'Nice — you answered everyone.' : 'Go online on Home to start receiving calls.'}</p></div>
        ) : list.map((c) => (
          <div key={c.id} className="list-row">
            <Avatar src={c.other_avatar} name={c.other_name} size={48} />
            <div className="txt">
              <b>{c.other_name}</b>
              <span><Icon name={c.type === 'video' ? 'video' : 'phone'} size={14} /> {c.type === 'video' ? 'Video' : 'Audio'} · {c.status === 'ended' ? mmss(c.seconds) : MISSED[c.status] || c.status} · {timeAgo(c.created_at)}{c.free_seconds > 0 ? ' · free trial' : ''}</span>
            </div>
            {c.status === 'ended'
              ? <span className={`chip ${c.earned > 0 ? 'chip-green' : 'chip-grey'}`}>{c.earned > 0 ? `+${c.earned}` : '0'}</span>
              : <span className="chip chip-red">{MISSED[c.status] || c.status}</span>}
          </div>
        ))}
      </div>
    </>
  );
}

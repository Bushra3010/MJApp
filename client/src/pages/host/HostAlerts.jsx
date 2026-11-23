import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import HostTop from '../../components/HostTop.jsx';

const ICON = { missed: '📞', payout: '💸', verification: '✅', level: '⭐', bonus: '🎁', referral: '🤝' };
export default function HostAlerts() {
  const { socket } = useAuth();
  const [data, setData] = useState(null);
  useEffect(() => {
    const load = () => api('/host/alerts').then((d) => { setData(d); if (d.unread) api('/host/alerts/read', { method: 'POST' }).then(() => window.dispatchEvent(new Event('mj:alerts-read'))); });
    load();
    socket?.on('alert:new', load);
    return () => socket?.off('alert:new', load);
  }, [socket]);
  return (
    <>
      <HostTop title="Alerts" />
      <div className="page">
        {!data ? <div className="spinner" /> : data.alerts.length === 0 ? (
          <div className="empty"><div className="big">🔔</div><b>No alerts yet</b><p>Missed calls, payouts, bonuses and level-ups show up here.</p></div>
        ) : data.alerts.map((a) => {
          const inner = (<><span className="al-ic" aria-hidden="true">{ICON[a.kind] || '🔔'}</span>
            <div className="txt"><b>{a.title}</b>{a.body && <span>{a.body}</span>}</div>
            <span className="faint" style={{ whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</span>{!a.read_at && <span className="dot-new" aria-label="new" />}</>);
          return a.url ? <Link key={a.id} to={a.url} className="list-row al-row">{inner}</Link> : <div key={a.id} className="list-row al-row">{inner}</div>;
        })}
      </div>
    </>
  );
}

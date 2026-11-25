// Host panel: members who are online now, new members, and everyone with online/offline status.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, timeAgo } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import HostTop from '../../components/HostTop.jsx';
import Avatar from '../../components/Avatar.jsx';

const TABS = [['online', 'Online'], ['new', 'New'], ['all', 'All']];

export default function HostCustomers() {
  const { socket } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'online';
  const [data, setData] = useState(null);

  useEffect(() => {
    let dead = false;
    const load = () => api(`/host/customers?tab=${tab}`).then((d) => !dead && setData(d)).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    // live presence: someone comes online / goes offline
    const on = (c) => setData((d) => {
      if (!d) return d;
      const rest = d.customers.filter((x) => x.id !== c.id);
      const list = tab === 'online' || tab === 'all' ? [{ ...c, online: 1 }, ...rest] : (c.isNew ? [{ ...c, online: 1 }, ...rest] : d.customers.map((x) => (x.id === c.id ? { ...x, online: 1 } : x)));
      return { ...d, customers: list, counts: { ...d.counts, online: d.counts.online + (d.customers.some((x) => x.id === c.id && x.online) ? 0 : 1) } };
    });
    const off = ({ id }) => setData((d) => d && ({
      ...d,
      customers: tab === 'online' ? d.customers.filter((x) => x.id !== id) : d.customers.map((x) => (x.id === id ? { ...x, online: 0 } : x)),
      counts: { ...d.counts, online: Math.max(0, d.counts.online - 1) },
    }));
    socket?.on('customer:online', on); socket?.on('customer:offline', off);
    return () => { dead = true; clearInterval(t); socket?.off('customer:online', on); socket?.off('customer:offline', off); };
  }, [tab, socket]);

  return (
    <>
      <HostTop title="Customers" />
      <div className="ht-tabs" role="tablist" aria-label="Customer lists">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setParams(k === 'online' ? {} : { tab: k }, { replace: true })}>
            {l}{data && <span className="tab-n">{data.counts[k]}</span>}
          </button>
        ))}
      </div>
      <div className="page">
        {!data ? <div className="spinner" /> : data.customers.length === 0 ? (
          <div className="empty"><div className="big">{tab === 'online' ? '🌙' : '👋'}</div>
            <b>{tab === 'online' ? 'No one online right now' : tab === 'new' ? 'No new members this week' : 'No members yet'}</b>
            <p>{tab === 'online' ? "You'll get a pop-up as soon as someone comes online." : 'Check back soon.'}</p></div>
        ) : data.customers.map((c, i) => (
          <Link key={c.id} to={`/host/customer/${c.id}`} className="list-row rise" style={{ '--i': Math.min(i, 12) }}>
            <Avatar src={c.avatar} name={c.name} size={52} online={!!c.online} />
            <div className="txt">
              <b>{c.name}{c.isNew && <span className="chip chip-green new-chip">New</span>}</b>
              <span>{[c.age && `${c.age} yrs`, c.gender && c.gender[0].toUpperCase() + c.gender.slice(1), c.city, (c.languages || '').split(',').slice(0, 2).join(', ')].filter(Boolean).join(' · ') || 'Member'}</span>
              <span className="view-prof">View profile ›</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className={`on-label ${c.online ? 'on' : ''}`}>{c.online ? 'Online' : 'Offline'}</span>
              <div className="faint">{c.online ? '' : c.last_seen_at ? `seen ${timeAgo(c.last_seen_at)}` : `joined ${timeAgo(c.created_at)}`}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

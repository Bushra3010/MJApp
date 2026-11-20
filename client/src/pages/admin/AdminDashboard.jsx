import { useEffect, useState } from 'react';
import { api, mmss, timeAgo } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';

export default function AdminDashboard() {
  const [s, setS] = useState(null);
  const { socket } = useAuth();
  useEffect(() => {
    const load = () => api('/admin/stats').then(setS);
    load();
    const t = setInterval(load, 10000);
    socket?.on('host:status', load);
    return () => { clearInterval(t); socket?.off('host:status', load); };
  }, [socket]);
  if (!s) return <div className="spinner" />;
  const k = [
    ['Revenue today (₹)', s.revenueToday], ['Revenue all time (₹)', s.revenueTotal],
    ['Users', s.users], ['Hosts', s.hosts], ['Hosts online', s.onlineHosts], ['Live calls', s.liveCalls],
    ['Calls today', s.callsToday], ['Minutes today', s.minutesToday], ['Messages today', s.messagesToday], ['Coins spent today', s.coinsSpentToday],
    ['Coins sold (all time)', s.coinsSoldTotal], ['Hosts awaiting approval', s.pendingHosts], ['Open reports', s.openReports], ['Pending payouts', s.pendingPayouts],
  ];
  return (
    <>
      <h1>Dashboard</h1>
      <div className="kpis">{k.map(([l, v]) => <div key={l} className="card kpi"><span>{l}</span><b>{Number(v).toLocaleString('en-IN')}</b></div>)}</div>
      {s.live.length > 0 && <>
        <h2 className="section-title">Live now</h2>
        <div className="card table-wrap" style={{ marginBottom: 20 }}><table className="t"><thead><tr><th>User</th><th>Host</th><th>Type</th><th>Status</th><th>Coins</th></tr></thead>
          <tbody>{s.live.map((c) => <tr key={c.id}><td>{c.userName}</td><td>{c.hostName}</td><td>{c.type}</td><td><span className="chip chip-green">{c.status}</span></td><td>{c.charged}</td></tr>)}</tbody></table></div>
      </>}
      <h2 className="section-title">Recent calls</h2>
      <div className="card table-wrap"><table className="t"><thead><tr><th>When</th><th>User</th><th>Host</th><th>Type</th><th>Status</th><th>Duration</th><th>Coins</th></tr></thead>
        <tbody>{s.recentCalls.map((c) => <tr key={c.id}><td>{timeAgo(c.created_at)}</td><td>{c.user_name}</td><td>{c.host_name}</td><td>{c.type}</td><td>{c.status}</td><td>{mmss(c.seconds)}</td><td>{c.coins_charged}</td></tr>)}
          {s.recentCalls.length === 0 && <tr><td colSpan={7} className="faint">No calls yet</td></tr>}</tbody></table></div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { api, mmss, timeAgo } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { emitAck } from '../../lib/socket.js';
import { useToast } from '../../lib/toast.jsx';
import TopBar from '../../components/TopBar.jsx';
import Coins from '../../components/Coins.jsx';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { enablePush, pushSupported } from '../../lib/push.js';

export default function HostHome() {
  const { user, setUser, socket, refresh } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [calls, setCalls] = useState([]);
  const host = user.host || {};
  const online = !!host.online;

  const load = () => { api('/host/stats').then(setStats); api('/calls').then(setCalls); refresh().catch(() => {}); };
  useEffect(() => {
    load();
    socket?.on('call:ended', load);
    const onStatus = (s) => { if (s.id === user.id) setUser((u) => ({ ...u, host: { ...u.host, online: s.online, busy: s.busy } })); };
    socket?.on('host:status', onStatus);
    return () => { socket?.off('call:ended', load); socket?.off('host:status', onStatus); };
  }, [socket]); // eslint-disable-line

  // Re-assert availability after reconnects (e.g. page refresh) — the host stays online until they switch off.
  useEffect(() => {
    if (!socket) return;
    const reassert = () => { if (user.host?.online) socket.emit('presence:set', { online: true }); };
    socket.on('connect', reassert);
    return () => socket.off('connect', reassert);
  }, [socket, user.host?.online]);

  const toggle = async () => {
    const res = await emitAck('presence:set', { online: !online });
    if (res?.error) return toast(res.error, 'error');
    setUser({ ...user, host: { ...host, online: res.online } });
    toast(res.online ? "You're online — users can call you now" : "You're offline", res.online ? 'success' : 'info');
    // Ask once for notifications so calls ring even when this tab is in the background.
    if (res.online && pushSupported() && Notification.permission === 'default') enablePush().catch(() => {});
  };

  return (
    <>
      <TopBar title={`Hi, ${user.name}`} right={<span className="chip chip-green" style={{ fontSize: 14, padding: '6px 12px' }}><Coins value={host.earnings} /></span>} />
      <div className="page">
        {!host.approved ? (
          <div className="card pending-card">
            <b>⏳ Waiting for approval</b>
            <p className="muted" style={{ marginTop: 4 }}>Our team reviews every host. You'll be able to go online once approved. Meanwhile, complete your profile in Me.</p>
          </div>
        ) : (
          <button className={`card online-card ${online ? 'on' : ''}`} onClick={toggle} style={{ width: '100%', textAlign: 'left' }} aria-pressed={online}>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 18, display: 'block' }}>{online ? (host.busy ? "You're on a call" : "You're online") : "You're offline"}</b>
              <span style={{ opacity: .85, fontSize: 14 }}>{online ? 'Keep this app open to receive calls' : 'Go online to start receiving calls'}</span>
            </div>
            <span className={`switch ${online ? 'on' : ''}`} />
          </button>
        )}
        <div className="stat-row">
          <div className="card stat"><b><Coins value={stats?.today ?? 0} /></b><span>Earned today</span></div>
          <div className="card stat"><b>{stats?.callsToday ?? 0}</b><span>Calls today</span></div>
          <div className="card stat"><b>{Math.round((stats?.secondsToday ?? 0) / 60)}</b><span>Minutes</span></div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div className="card rate" style={{ flex: 1, padding: 12 }}><span className="faint">Audio rate</span><b><Coins value={host.audio_rate} />/min</b></div>
          <div className="card rate" style={{ flex: 1, padding: 12 }}><span className="faint">Video rate</span><b><Coins value={host.video_rate} />/min</b></div>
        </div>
        <div className="section-title">Recent calls</div>
        {calls.length === 0 ? <p className="faint">No calls yet. Go online and they'll start coming in.</p> : calls.slice(0, 10).map((c) => (
          <div key={c.id} className="list-row">
            <Avatar src={c.other_avatar} name={c.other_name} size={44} />
            <div className="txt"><b>{c.other_name}</b><span><Icon name={c.type === 'video' ? 'video' : 'phone'} size={14} /> {c.status === 'ended' ? mmss(c.seconds) : c.status} · {timeAgo(c.created_at)}</span></div>
          </div>
        ))}
      </div>
    </>
  );
}

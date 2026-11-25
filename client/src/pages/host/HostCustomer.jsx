// A member's profile as a host sees it: online status, when they joined, calls with you.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, mmss, timeAgo } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import { initials, warmFor } from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import ReportSheet from '../../components/ReportSheet.jsx';

export default function HostCustomer() {
  const { id } = useParams();
  const { socket } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [c, setC] = useState(null);
  const [menu, setMenu] = useState(false);
  useEffect(() => { api(`/host/customers/${id}`).then(setC).catch((e) => { toast(e.message, 'error'); nav('/host/customers'); }); }, [id]); // eslint-disable-line
  useEffect(() => {
    const on = (x) => x.id === Number(id) && setC((v) => v && { ...v, online: 1 });
    const off = (x) => x.id === Number(id) && setC((v) => v && { ...v, online: 0 });
    socket?.on('customer:online', on); socket?.on('customer:offline', off);
    return () => { socket?.off('customer:online', on); socket?.off('customer:offline', off); };
  }, [socket, id]);
  if (!c) return <div className="spinner" />;
  const langs = (c.languages || '').split(',').map((l) => l.trim()).filter(Boolean);
  return (
    <div className="app-shell">
      <header className="p-head">
        <button className="circle-btn" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" size={18} /></button>
        <div style={{ minWidth: 0 }}><h1>{c.name}</h1><small>{c.city || 'India'}</small></div>
        <button className="circle-btn" onClick={() => setMenu(true)} aria-label="Report or block"><Icon name="more" size={18} /></button>
      </header>
      <div className="p-photo">
        {c.avatar ? <img src={c.avatar} alt={c.name} /> : <div className="ini" style={{ background: warmFor(c.name) }}>{initials(c.name)}</div>}
        <span className={`hero-tag status ${c.online ? 'on' : ''}`}><i />{c.online ? 'Online now' : 'Offline'}</span>
      </div>
      <div className="p-body">
        <div className="pills">
          {c.isNew && <span className="pill2">🆕 New member</span>}
          <span className="pill2">📅 Joined {timeAgo(c.created_at)}</span>
          {!c.online && c.last_seen_at && <span className="pill2">👀 Seen {timeAgo(c.last_seen_at)}</span>}
        </div>
        {c.bio && <><div className="p-label">About</div><p className="p-text">{c.bio}</p></>}
        {langs.length > 0 && <><div className="p-label">Languages</div><div className="pills">{langs.map((l) => <span key={l} className="pill2">🗣️ {l}</span>)}</div></>}
        <div className="p-label">With you</div>
        <div className="pills">
          <span className="pill2">📞 {c.callsWithYou} {c.callsWithYou === 1 ? 'call' : 'calls'}</span>
          <span className="pill2">⏱️ {mmss(c.secondsWithYou)} talked</span>
        </div>
        {c.conversationId
          ? <Link to={`/host/chat/${c.conversationId}`} className="btn btn-primary btn-block" style={{ marginTop: 18 }}><Icon name="chat" size={18} />Open chat</Link>
          : <p className="faint" style={{ marginTop: 14 }}>Members start chats and calls. Stay online so {c.name.split(' ')[0]} can reach you.</p>}
      </div>
      {menu && <ReportSheet target={c} onClose={() => setMenu(false)} onBlocked={() => nav('/host/customers')} />}
    </div>
  );
}

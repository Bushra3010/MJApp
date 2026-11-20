import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import TopBar from '../components/TopBar.jsx';
import Avatar from '../components/Avatar.jsx';

export function preview(c) {
  if (c.last_type === 'gift') { try { const g = JSON.parse(c.last_body); return `${g.emoji} Sent a ${g.name}`; } catch { return '🎁 Gift'; } }
  if (c.last_type === 'call') return `📞 ${c.last_body}`;
  return c.last_body || 'Say hi 👋';
}

export default function Chats() {
  const { socket, user } = useAuth();
  const [list, setList] = useState(null);
  const base = user.role === 'host' ? '/host' : '/app';
  useEffect(() => {
    const load = () => api('/conversations').then(setList).catch(() => setList([]));
    load();
    socket?.on('message:new', load);
    return () => socket?.off('message:new', load);
  }, [socket]);

  return (
    <>
      <TopBar title="Chats" />
      <div className="page">
        {!list ? <div className="spinner" /> : list.length === 0 ? (
          <div className="empty"><div className="big">💬</div><b>No chats yet</b><p>{user.role === 'host' ? 'When users message you, they show up here.' : 'Find someone on Discover and say hi.'}</p></div>
        ) : <div className="chat-list">{list.map((c, i) => (
          <Link key={c.id} to={`${base}/chat/${c.id}`} className="list-row rise" style={{ '--i': i }}>
            <Avatar src={c.other_avatar} name={c.other_name} size={52} online={user.role === 'user' ? !!c.online : undefined} busy={!!c.busy} />
            <div className="txt"><b>{c.other_name}</b><span className={c.unread > 0 ? 'unread' : ''}>{preview(c)}</span></div>
            <div style={{ textAlign: 'right' }}>
              <div className="faint">{timeAgo(c.last_message_at)}</div>
              {c.unread > 0 && <span className="badge">{c.unread}</span>}
            </div>
          </Link>
        ))}</div>}
      </div>
    </>
  );
}

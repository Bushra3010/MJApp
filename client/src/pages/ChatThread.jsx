import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, clock } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useCall } from '../lib/call.jsx';
import { useToast } from '../lib/toast.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import Coins from '../components/Coins.jsx';
import Sheet from '../components/Sheet.jsx';
import ReportSheet from '../components/ReportSheet.jsx';

export default function ChatThread() {
  const { id } = useParams();
  const { user, socket } = useAuth();
  const { startCall } = useCall();
  const toast = useToast();
  const nav = useNavigate();
  const [conv, setConv] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [gifts, setGifts] = useState(null);
  const [menu, setMenu] = useState(false);
  const [typing, setTyping] = useState(false);
  const [cfg, setCfg] = useState({ chatCost: 0 });
  const end = useRef(null);
  const isUser = user.role === 'user';

  useEffect(() => {
    api(`/conversations/${id}`).then(setConv).catch(() => nav(-1));
    api(`/conversations/${id}/messages`).then((m) => { setMsgs(m); window.dispatchEvent(new Event('mj:read')); });
    api('/config').then(setCfg);
  }, [id]); // eslint-disable-line
  useEffect(() => {
    if (!socket) return;
    let t;
    const onMsg = (m) => {
      if (m.conversation_id !== Number(id)) return;
      setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
      setTyping(false);
      if (m.sender_id !== user.id) api(`/conversations/${id}/messages?before=1`).then(() => window.dispatchEvent(new Event('mj:read')));
    };
    const onTyping = (p) => { if (p.conversationId === Number(id)) { setTyping(true); clearTimeout(t); t = setTimeout(() => setTyping(false), 2500); } };
    const onStatus = (s) => setConv((c) => (c && c.host_id === s.id ? { ...c, host: { ...c.host, online: s.online, busy: s.busy } } : c));
    socket.on('message:new', onMsg); socket.on('typing', onTyping); socket.on('host:status', onStatus);
    return () => { socket.off('message:new', onMsg); socket.off('typing', onTyping); socket.off('host:status', onStatus); };
  }, [socket, id, user.id]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, typing]);

  const lastTyping = useRef(0);
  const onType = (e) => {
    setText(e.target.value);
    if (conv && Date.now() - lastTyping.current > 1500) { lastTyping.current = Date.now(); socket?.emit('typing', { conversationId: Number(id), to: conv.other.id }); }
  };
  const send = async (e) => {
    e.preventDefault();
    const body = text.trim(); if (!body) return;
    setText('');
    try { const m = await api(`/conversations/${id}/messages`, { method: 'POST', body: { body } }); setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m])); }
    catch (err) { setText(body); toast(err.message, 'error'); if (err.status === 402) nav('/app/wallet'); }
  };
  const sendGift = async (g) => {
    try { await api(`/conversations/${id}/gift`, { method: 'POST', body: { giftId: g.id } }); setGifts(null); toast(`${g.emoji} ${g.name} sent!`, 'success'); }
    catch (err) { toast(err.message, 'error'); if (err.status === 402) nav('/app/wallet'); }
  };
  const call = (type) => startCall({ id: conv.other.id, name: conv.other.name, avatar: conv.other.avatar }, type).then((r) => { if (r?.code === 'LOW_BALANCE') nav('/app/wallet'); });

  if (!conv) return <div className="spinner" />;
  const avail = conv.host.online && !conv.host.busy;

  return (
    <div className="chat">
      <header className="topbar">
        <button onClick={() => nav(-1)} aria-label="Back"><Icon name="back" /></button>
        <Avatar src={conv.other.avatar} name={conv.other.name} size={40} online={isUser ? !!conv.host.online : undefined} busy={!!conv.host.busy} />
        <div style={{ minWidth: 0 }}>
          <b style={{ display: 'block' }}>{conv.other.name}</b>
          <span className="faint">{typing ? 'typing…' : isUser ? (avail ? 'Online' : conv.host.busy ? 'On a call' : 'Offline') : conv.other.city || 'Customer'}</span>
        </div>
        <div className="spacer" />
        {isUser && <>
          <button className="mini-btn" style={{ width: 40 }} disabled={!avail} onClick={() => call('audio')} aria-label="Audio call"><Icon name="phone" size={18} /></button>
          <button className="mini-btn video" style={{ width: 40 }} disabled={!avail} onClick={() => call('video')} aria-label="Video call"><Icon name="video" size={18} /></button>
        </>}
        <button onClick={() => setMenu(true)} aria-label="More"><Icon name="more" /></button>
      </header>
      <div className="msgs">
        {msgs.length === 0 && <div className="empty"><div className="big">👋</div><p>Say hi to {conv.other.name}!{isUser && cfg.chatCost > 0 ? ` Each message costs ${cfg.chatCost} coin.` : ''}</p></div>}
        {msgs.map((m) => {
          const mine = m.sender_id === user.id;
          if (m.type === 'call' || m.type === 'system') return <div key={m.id} className="sys">{m.type === 'call' ? '📞' : 'ℹ️'} {m.body} · {clock(m.created_at)}</div>;
          if (m.type === 'gift') {
            let g = {}; try { g = JSON.parse(m.body); } catch { /* */ }
            return <div key={m.id} className={`bubble gift ${mine ? 'me' : 'them'}`} style={{ alignSelf: mine ? 'flex-end' : 'flex-start' }}><div className="g">{g.emoji}</div><b>{mine ? 'You sent' : 'Sent you'} a {g.name}</b><time>{clock(m.created_at)}</time></div>;
          }
          return <div key={m.id} className={`bubble ${mine ? 'me' : 'them'}`}>{m.body}<time>{clock(m.created_at)}</time></div>;
        })}
        {typing && <div className="bubble them" style={{ opacity: .7 }}>typing…</div>}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={send}>
        {isUser && <button type="button" className="gift-btn" aria-label="Send a gift" onClick={() => api('/gifts').then(setGifts)}>🎁</button>}
        <input className="input" placeholder={isUser && cfg.chatCost > 0 ? `Message · ${cfg.chatCost} coin` : 'Message'} value={text} onChange={onType} maxLength={2000} />
        <button className="send" aria-label="Send"><Icon name="send" size={20} /></button>
      </form>
      {gifts && (
        <Sheet title={`Send ${conv.other.name} a gift`} onClose={() => setGifts(null)}>
          <p className="faint" style={{ marginBottom: 12 }}>Your balance: <Coins value={user.coins} /></p>
          <div className="gift-grid">
            {gifts.map((g) => <button key={g.id} onClick={() => sendGift(g)}><span className="e">{g.emoji}</span>{g.name}<Coins value={g.price} /></button>)}
          </div>
        </Sheet>
      )}
      {menu && <ReportSheet target={conv.other} onClose={() => setMenu(false)} onBlocked={() => nav(-1)} />}
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, mmss } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import Stars from './Stars.jsx';
import { useCall } from '../lib/call.jsx';
import { useHosts, isFree } from '../lib/hosts.js';
import { useRecharge, useStartCall } from '../lib/recharge.jsx';

import Avatar, { initials, warmFor } from './Avatar.jsx';
import Icon from './Icon.jsx';
import Coins from './Coins.jsx';

/** Shown to customers after every call: how long it lasted, what it cost, and who else is free right now. */
export default function CallSummary() {
  const { call, dismiss } = useCall();
  const { openRecharge } = useRecharge();
  const startCall = useStartCall();
  const nav = useNavigate();
  const hosts = useHosts();
  const peer = call.peer || {};
  const s = call.summary || {};
  const others = (hosts || []).filter((h) => h.id !== peer.id && isFree(h, 'video')).slice(0, 3);
  const outOfCoins = s.reason === 'balance' || s.reason === 'trial_ended';
  const toast = useToast();
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState('');
  const [rated, setRated] = useState(false);
  const [sending, setSending] = useState(false);
  const sendReview = async () => {
    setSending(true);
    try { await api(`/calls/${s.callId}/review`, { method: 'POST', body: { stars, body: review } }); setRated(true); toast('Thanks for your rating!', 'success'); }
    catch (e) { toast(e.message, 'error'); } finally { setSending(false); }
  };

  const then = (fn) => { dismiss(); setTimeout(fn, 60); };
  const callHost = (h) => then(() => startCall({ id: h.id, name: h.name, avatar: h.avatar }, 'video'));

  return (
    <div className="call summary" role="dialog" aria-label="Call summary">
      <div className="bg" style={peer.avatar ? { backgroundImage: `url(${peer.avatar})` } : { background: 'radial-gradient(circle at 50% 20%, #b0105a, #14060e 70%)' }} />
      <button className="sum-x" onClick={dismiss} aria-label="Close"><Icon name="x" size={20} strokeWidth="2.6" /></button>
      <div className="sum-body">
        <Avatar src={peer.avatar} name={peer.name} size={84} />
        <h2>{peer.name}</h2>
        <p className="sum-msg">{s.message}</p>
        <div className="sum-stats">
          <div><b>{mmss(s.seconds || 0)}</b><span>Call duration</span></div>
          <div><b><Coins value={s.charged || 0} /></b><span>Spent coins</span></div>
        </div>
        {s.reviewable && !rated && (
          <div className="rate-box">
            <b>How was your call with {peer.name}?</b>
            <Stars value={stars} onPick={setStars} size={34} label={`Rate your call with ${peer.name}`} />
            {stars > 0 && <>
              <textarea className="input" rows={2} maxLength={300} value={review} onChange={(e) => setReview(e.target.value)} placeholder="Write a review (optional)" aria-label="Review" />
              <button className="btn btn-primary btn-sm" onClick={sendReview} disabled={sending}>{sending ? 'Sending…' : 'Submit rating'}</button>
            </>}
          </div>
        )}
        {rated && <p className="sum-msg">⭐ Thanks — your rating helps others</p>}
        {outOfCoins && (
          <button className="btn btn-primary btn-block" onClick={() => then(() => openRecharge({ host: peer, type: call.type, reason: 'Recharge to keep talking.' }))}>
            <Icon name="coin" size={18} />Recharge &amp; call {peer.name} again
          </button>
        )}
        {others.length > 0 && <>
          <div className="sum-title">Continue chatting with others</div>
          <div className="sum-grid">
            {others.map((h) => (
              <div key={h.id} className="sum-card">
                <button className="sc-ph" onClick={() => then(() => nav(`/app/host/${h.id}`))} aria-label={`Open ${h.name}'s profile`}>
                  {h.avatar ? <img src={h.avatar} alt="" /> : <div className="ini" style={{ background: warmFor(h.name) }}>{initials(h.name)}</div>}
                  <span className="h-status on"><i />Online</span>
                  <span className="sc-name">{h.name}<small><Coins value={h.video_rate} />/min</small></span>
                </button>
                <button className="sc-call" onClick={() => callHost(h)} aria-label={`Video call ${h.name}`}><Icon name="video" size={18} fill /></button>
              </div>
            ))}
          </div>
        </>}
        <button className="btn btn-block sum-match" onClick={() => then(() => nav('/app/match?go=1'))}>
          <Icon name="heart" size={18} fill />Continue match
        </button>
      </div>
    </div>
  );
}

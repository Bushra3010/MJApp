// Host Home: My Page · Stats · Offers · Help videos
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { emitAck } from '../../lib/socket.js';
import { useToast } from '../../lib/toast.jsx';
import { enablePush, pushSupported } from '../../lib/push.js';
import HostTop from '../../components/HostTop.jsx';
import Coins from '../../components/Coins.jsx';
import Icon from '../../components/Icon.jsx';

const TABS = [['page', 'My Page'], ['stats', 'Stats'], ['offers', 'Offers'], ['help', 'Help videos']];
export const compact = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(2)}K` : String(n));

export function LevelProgress({ prog, compactView = false }) {
  const next = prog.next;
  const cur = prog.levels.find((t) => t.level === prog.level) || prog.levels[0];
  const from = cur?.target || 0;
  const pct = next ? Math.min(100, Math.max(0, ((prog.totalEarned - from) / (next.target - from)) * 100)) : 100;
  return (
    <div className="card lvl-card">
      <div className="row">
        <b className="lvl-title">Level progress</b><div className="spacer" />
        <span className="lvl-badge">★ {prog.level}</span>
        {next && <><span aria-hidden="true">→</span><span className="lvl-badge locked"><Icon name="lock" size={12} /> ★ {next.level}</span></>}
      </div>
      <div className="lvl-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next level"><span style={{ width: `${pct}%` }} /></div>
      {next ? (<>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="lvl-amt"><Coins value={compact(prog.totalEarned)} /> <small>/ {compact(next.target)}</small></span>
          <span className="lvl-need">+{compact(Math.max(0, next.target - prog.totalEarned))} to Level {next.level}</span>
        </div>
        {!compactView && <p className="faint" style={{ marginTop: 8 }}>At Level {next.level} you earn ₹{next.audio_earn}/min on audio and ₹{next.video_earn}/min on video calls.</p>}
      </>) : <p className="muted" style={{ marginTop: 6 }}>You're at the top level 🏆</p>}
      {prog.minWithdrawInr > 0 && (() => {
        const have = prog.earningsInr || 0; const min = prog.minWithdrawInr; const ok = have >= min;
        const rs = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
        return (
          <Link to="/host/wallet" className={`wd-line ${ok ? 'ok' : ''}`}>
            <Icon name="wallet" size={16} />
            <span>{ok ? <>You can withdraw now · <b>{rs(have)}</b> ready</> : <>Withdraw after your income reaches <b>{rs(min)}</b> · {rs(have)} / {rs(min)}</>}</span>
          </Link>
        );
      })()}
    </div>
  );
}

function MyPage() {
  const { user, setUser, socket } = useAuth();
  const toast = useToast();
  const host = user.host || {};
  const online = !!host.online;
  const [prog, setProg] = useState(null);
  useEffect(() => { api('/host/program').then(setProg); }, [host.level]);

  useEffect(() => {
    if (!socket) return;
    const onStatus = (s) => { if (s.id === user.id && s.online !== undefined) setUser((u) => ({ ...u, host: { ...u.host, online: s.online, busy: s.busy } })); };
    const reassert = () => { if (user.host?.online) socket.emit('presence:set', { online: true }); };
    socket.on('host:status', onStatus); socket.on('connect', reassert);
    return () => { socket.off('host:status', onStatus); socket.off('connect', reassert); };
  }, [socket, user.host?.online]); // eslint-disable-line

  const toggle = async () => {
    const res = await emitAck('presence:set', { online: !online });
    if (res?.error) return toast(res.error, 'error');
    setUser({ ...user, host: { ...host, online: res.online } });
    toast(res.online ? "You're online — users can call you now" : "You're offline", res.online ? 'success' : 'info');
    if (res.online && pushSupported() && Notification.permission === 'default') enablePush().catch(() => {});
  };
  const setTypes = async (audio, video) => {
    const before = prog;
    setProg({ ...prog, acceptAudio: audio, acceptVideo: video }); // update right away; undo if the server says no
    try { setProg(await api('/host/call-types', { method: 'PUT', body: { audio, video } })); }
    catch (e) { setProg(before); toast(e.message, 'error'); }
  };

  if (!host.approved) {
    return (
      <div className="card pending-card">
        <b>⏳ Waiting for approval</b>
        <p className="muted" style={{ marginTop: 4 }}>Our team reviews every host. You'll be able to go online once approved. Meanwhile, add your photo, bank details and verification in Account.</p>
      </div>
    );
  }
  const kyc = host.kyc_status || 'none';
  return (<>
    {kyc !== 'verified' && (
      <Link to="/host/verification" className={`card verify-banner ${kyc}`}>
        <Icon name="shield" size={22} />
        <div><b>{kyc === 'pending' ? 'Verification under review' : kyc === 'rejected' ? 'Verification not approved' : 'Verify your identity to start working'}</b>
          <span>{kyc === 'pending' ? 'We check your ID and gender. You can go online once approved.' : 'Upload a photo ID and a selfie. Only verified hosts can go online — members see a verified badge.'}</span></div>
        <Icon name="chevron" size={18} />
      </Link>
    )}
    <div className="card mp-card">
      <div className={`mp-status ${online ? 'on' : ''}`}>
        <i />
        <div><b>{online ? (host.busy ? "You're on a call" : 'You are online') : 'You are offline'}</b>
          <span>{online ? 'Go offline to take a break from calls.' : 'Go online to start receiving calls.'}</span></div>
      </div>
      <button className={`btn btn-block mp-btn ${online ? 'btn-green' : 'btn-primary'}`} onClick={toggle} aria-pressed={online}>
        <Icon name="power" size={20} /> {online ? 'Go Offline' : 'Go Online'}
      </button>
      {prog && (<>
        <p className="mp-q">Which type of calls do you want to receive?</p>
        <div className="row" style={{ gap: 18 }}>
          <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={prog.acceptAudio} onChange={(e) => setTypes(e.target.checked, prog.acceptVideo)} /><span>Audio call</span></label>
          <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={prog.acceptVideo} onChange={(e) => setTypes(prog.acceptAudio, e.target.checked)} /><span>Video call</span></label>
        </div>
      </>)}
    </div>
    {prog && <LevelProgress prog={prog} />}
    {prog && (
      <Link to="/host/rate" className="card menu-row" style={{ marginTop: 12 }}>
        <span className="ic violet"><Icon name="coin" size={20} /></span>
        <span className="t">My level & rate<small>Level {prog.level} · you earn ₹{prog.earnVideo}/min video · ₹{prog.earnAudio}/min audio</small></span>
        <Icon name="chevron" size={18} className="chev" />
      </Link>
    )}
  </>);
}

function StatsTab() {
  const [s, setS] = useState(null);
  useEffect(() => { api('/host/stats').then(setS); const t = setInterval(() => api('/host/stats').then(setS), 60_000); return () => clearInterval(t); }, []);
  if (!s) return <div className="spinner" />;
  const toWithdraw = Math.max(0, s.minWithdraw - s.profile.earnings);
  const mins = Math.round(s.onlineSecondsToday / 60);
  const Box = ({ label, value, coin = true }) => <div className="st-box"><span>{label}</span><b>{coin ? <Coins value={value} /> : value}</b></div>;
  return (
    <div className="card st-card">
      <b className="st-h">Your stats</b>
      <div className="st-top">
        <div><span>Today's earning</span><b><Coins value={s.today} /></b></div>
        <div><span>Today online</span><b>{mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}</b></div>
        <div><span>Week's earning</span><b><Coins value={s.weekBreakdown.total} /></b></div>
      </div>
      <div className="st-withdraw">
        {toWithdraw > 0 ? <>Earn <Coins value={compact(toWithdraw)} /> more to withdraw{s.minWithdrawInr > 0 ? ` (minimum ₹${s.minWithdrawInr.toLocaleString('en-IN')})` : ''}</> : <>You can withdraw now · <Link className="link" to="/host/wallet">Wallet →</Link></>}
        <div className="lvl-bar"><span style={{ width: `${Math.min(100, (s.profile.earnings / s.minWithdraw) * 100)}%` }} /></div>
      </div>
      <b className="st-h">Today</b>
      <div className="st-grid">
        <Box label="Missed calls" value={s.missedToday} coin={false} /><Box label="Call earning" value={s.todayBreakdown.call} />
        <Box label="Gift earning" value={s.todayBreakdown.gift} /><Box label="Other earning" value={s.todayBreakdown.other} />
      </div>
      <b className="st-h">This week</b>
      <div className="st-grid">
        <Box label="Call earning" value={s.weekBreakdown.call} /><Box label="Gift earning" value={s.weekBreakdown.gift} />
        <Box label="Other earning" value={s.weekBreakdown.other} /><Box label="Total calls" value={s.totalCalls} coin={false} />
      </div>
    </div>
  );
}

function OffersTab() {
  const [offers, setOffers] = useState(null);
  const [inv, setInv] = useState(null);
  useEffect(() => { api('/host/offers').then(setOffers); api('/host/invite').then(setInv); }, []);
  if (!offers) return <div className="spinner" />;
  return (<>
    {offers.map((o) => (
      <div key={o.id} className={`offer-card tone-${o.tone}`}>
        <h3>{o.title}</h3><p>{o.body}</p>
        {/weekly/i.test(o.title) ? <Link to="/host/leaderboard" className="btn btn-sm offer-btn">See leaderboard</Link> : null}
      </div>
    ))}
    {inv && (
      <Link to="/host/invite" className="offer-card tone-blue invite-card">
        <span className="big-emoji" aria-hidden="true">💰</span>
        <div><h3>Invite hosts & earn {inv.pct}%</h3><p>Earn {inv.pct}% on top of everything the hosts you invite earn.</p></div>
        <span className="btn btn-sm offer-btn">Invite</span>
      </Link>
    )}
  </>);
}

function HelpTab() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [lang, setLang] = useState('');
  useEffect(() => { api(`/host/help-videos${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`).then(setData); }, [lang]);
  useEffect(() => {
    if (data && !lang && data.languages.length) {
      const mine = (user.languages || '').split(',').map((s) => s.trim()).find((l) => data.languages.includes(l));
      if (mine) setLang(mine);
    }
  }, [data]); // eslint-disable-line
  if (!data) return <div className="spinner" />;
  return (<>
    <p className="mp-q" style={{ marginTop: 0 }}>Select your language</p>
    <div className="filters" style={{ flexWrap: 'wrap' }}>
      <button className={!lang ? 'on' : ''} aria-pressed={!lang} onClick={() => setLang('')}>All</button>
      {data.languages.map((l) => <button key={l} className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>{l}</button>)}
    </div>
    {data.videos.length === 0 ? <div className="empty"><div className="big">🎬</div><b>No videos yet</b><p>Help videos will appear here soon.</p></div> : data.videos.map((v) => (
      <a key={v.id} className="video-card" href={`https://www.youtube.com/watch?v=${v.youtube_id}`} target="_blank" rel="noreferrer">
        <div className="thumb"><img src={`https://i.ytimg.com/vi/${v.youtube_id}/hqdefault.jpg`} alt="" loading="lazy" /><span className="play"><Icon name="play" size={26} fill /></span></div>
        <div className="vt"><span className="yt" aria-hidden="true">▶</span>{v.title}<small>{v.language}</small></div>
      </a>
    ))}
  </>);
}

export default function HostHome() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'page';
  return (
    <>
      <HostTop title="Home" />
      <div className="ht-tabs" role="tablist" aria-label="Home sections">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setParams(k === 'page' ? {} : { tab: k }, { replace: true })}>{l}</button>)}
      </div>
      <div className="page">
        {tab === 'page' && <MyPage />}
        {tab === 'stats' && <StatsTab />}
        {tab === 'offers' && <OffersTab />}
        {tab === 'help' && <HelpTab />}
      </div>
    </>
  );
}

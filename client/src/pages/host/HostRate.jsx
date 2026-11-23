// My call rate: current rates, change rate (up to your level), level progress and the level table.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import Coins from '../../components/Coins.jsx';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import { LevelProgress, compact } from './HostHome.jsx';

export default function HostRate() {
  const nav = useNavigate();
  const toast = useToast();
  const { refresh } = useAuth();
  const [prog, setProg] = useState(null);
  const [picking, setPicking] = useState(false);
  useEffect(() => { api('/host/program').then(setProg); }, []);
  const choose = async (lvl) => {
    try { setProg(await api('/host/rate', { method: 'PUT', body: { rateLevel: lvl } })); refresh().catch(() => {}); toast('Call rate updated', 'success'); setPicking(false); }
    catch (e) { toast(e.message, 'error'); }
  };
  if (!prog) return <div className="spinner" />;
  return (
    <>
      <header className="topbar"><button className="icon-btn press" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" /></button><h1>My call rate</h1></header>
      <div className="page">
        <div className="rate-hero">
          <div className="row" style={{ justifyContent: 'space-around' }}>
            <div><span>Video call rate</span><b><Coins value={prog.videoRate} />/min</b></div>
            <div><span>Audio call rate</span><b><Coins value={prog.audioRate} />/min</b></div>
          </div>
          {prog.rateLevel === 0 && <p style={{ marginTop: 8, fontSize: 13, opacity: .9 }}>Custom rate set by Milo Julo. Pick a tier to change it.</p>}
          <button className="btn btn-sm rate-change" onClick={() => setPicking(true)}>Change call rate</button>
          <div className="rate-level">My level: <span className="lvl-badge">★ {prog.level}</span></div>
        </div>
        <LevelProgress prog={prog} />
        <div className="section-title">Levels</div>
        <div className="card table-wrap" tabIndex={0} role="region" aria-label="Level table">
          <table className="t lvl-table">
            <thead><tr><th>Level</th><th>Weekly earning</th><th>Video</th><th>Audio</th></tr></thead>
            <tbody>{prog.levels.map((t) => (
              <tr key={t.level} className={t.level === prog.level ? 'mine' : t.level > prog.level ? 'locked' : ''}>
                <td><span className={`lvl-badge ${t.level > prog.level ? 'locked' : ''}`}>{t.level > prog.level && <Icon name="lock" size={11} />} ★ {t.level}</span></td>
                <td><Coins value={compact(t.weekly)} /></td><td><Coins value={t.video} />/min</td><td><Coins value={t.audio} />/min</td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="faint" style={{ marginTop: 10 }}>Your level for the week is set every Monday from last week's earnings. A lower rate can bring you more calls.</p>
      </div>
      {picking && (
        <Sheet title="Select call rate" onClose={() => setPicking(false)}>
          <div className="rate-pick">
            {prog.levels.map((t) => {
              const locked = t.level > prog.level;
              return (
                <button key={t.level} type="button" disabled={locked} onClick={() => choose(t.level)} aria-pressed={prog.rateLevel === t.level} className={prog.rateLevel === t.level ? 'on' : ''}>
                  <span className={`lvl-badge ${locked ? 'locked' : ''}`}>{locked && <Icon name="lock" size={11} />} ★ {t.level}</span>
                  <span><Coins value={t.video} />/min</span><span><Coins value={t.audio} />/min</span>
                  <span className="box" aria-hidden="true">{prog.rateLevel === t.level ? '✓' : ''}</span>
                </button>
              );
            })}
          </div>
          <p className="faint" style={{ marginTop: 10 }}>Video rate · audio rate per minute. Locked rates open up as you level up.</p>
        </Sheet>
      )}
    </>
  );
}

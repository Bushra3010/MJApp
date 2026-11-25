// My level & call rate: what I earn per minute, what members pay, and how far the next level is.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import Coins from '../../components/Coins.jsx';
import Icon from '../../components/Icon.jsx';
import { LevelProgress, compact } from './HostHome.jsx';

const rs = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function HostRate() {
  const nav = useNavigate();
  const [prog, setProg] = useState(null);
  useEffect(() => { api('/host/program').then(setProg); }, []);
  if (!prog) return <div className="spinner" />;
  return (
    <>
      <header className="topbar"><button className="icon-btn press" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" /></button><h1>My level & rate</h1></header>
      <div className="page">
        <div className="rate-hero">
          <div className="rate-level" style={{ marginTop: 0, marginBottom: 10 }}>Current level: <span className="lvl-badge">★ {prog.level}</span></div>
          <div className="row" style={{ justifyContent: 'space-around' }}>
            <div><span>Video call</span><b>{rs(prog.earnVideo)}/min</b></div>
            <div><span>Audio call</span><b>{rs(prog.earnAudio)}/min</b></div>
          </div>
          <p style={{ marginTop: 10, fontSize: 13, opacity: .9 }}>What you earn per minute of call</p>
          <p className="row" style={{ justifyContent: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, opacity: .85, marginTop: 4 }}>
            <span>Members pay</span><span style={{ whiteSpace: 'nowrap' }}><Coins value={prog.videoRate} />/min video</span><span>·</span><span style={{ whiteSpace: 'nowrap' }}><Coins value={prog.audioRate} />/min audio</span>
          </p>
          {prog.customRate && <p style={{ marginTop: 4, fontSize: 12, opacity: .85 }}>Member price set by Milo Julo for your profile.</p>}
        </div>
        <LevelProgress prog={prog} />
        <div className="section-title">Levels</div>
        <div className="card table-wrap" tabIndex={0} role="region" aria-label="Level table">
          <table className="t lvl-table">
            <thead><tr><th>Level</th><th>Target (coins earned)</th><th>Audio</th><th>Video</th></tr></thead>
            <tbody>{prog.levels.map((t) => (
              <tr key={t.level} className={t.level === prog.level ? 'mine' : t.level > prog.level ? 'locked' : ''}>
                <td><span className={`lvl-badge ${t.level > prog.level ? 'locked' : ''}`}>{t.level > prog.level && <Icon name="lock" size={11} />} ★ {t.level}</span></td>
                <td>{t.target === 0 ? 'Starting level' : <><Coins value={compact(t.target)} /> completed</>}</td>
                <td>{rs(t.audio_earn)}/min</td><td>{rs(t.video_earn)}/min</td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="faint" style={{ marginTop: 10 }}>Your level goes up automatically when your total earnings reach the target, and it never goes down. Your audio and video rates go up with it.</p>
      </div>
    </>
  );
}

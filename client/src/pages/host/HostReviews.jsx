// Host: my rating and what members wrote.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, timeAgo } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import Stars from '../../components/Stars.jsx';

export default function HostReviews() {
  const nav = useNavigate();
  const [r, setR] = useState(null);
  useEffect(() => { api('/host/reviews').then(setR); }, []);
  return (
    <>
      <header className="topbar"><button className="icon-btn press" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" /></button><h1>My ratings</h1></header>
      <div className="page">
        {!r ? <div className="spinner" /> : r.count === 0 ? (
          <div className="empty"><div className="big">⭐</div><b>No ratings yet</b><p>Members can rate you after a call. Friendly, respectful calls get the best ratings.</p></div>
        ) : (<>
          <div className="card rev-summary">
            <div className="big-num">{r.avg}<Stars value={r.avg} size={18} /><span className="faint">{r.count} ratings</span></div>
            <div className="dist">{[5, 4, 3, 2, 1].map((s) => (
              <div key={s} className="row"><span>{s}★</span><div className="lvl-bar"><span style={{ width: `${r.count ? (r.dist[s] / r.count) * 100 : 0}%` }} /></div><span className="faint">{r.dist[s]}</span></div>
            ))}</div>
          </div>
          <div className="section-title">Reviews</div>
          {r.reviews.map((v) => (
            <div key={v.id} className="rev card">
              <div className="row"><b>{v.name}</b><Stars value={v.stars} size={13} /><div className="spacer" /><span className="faint">{timeAgo(v.created_at)}</span></div>
              {v.body ? <p>{v.body}</p> : <p className="faint">No comment</p>}
            </div>
          ))}
        </>)}
      </div>
    </>
  );
}

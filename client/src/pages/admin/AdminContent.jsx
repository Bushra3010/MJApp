// Offers shown in the host app's Offers tab, and the Help videos list.
import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';

export default function AdminContent() {
  const toast = useToast();
  const [offers, setOffers] = useState(null);
  const [videos, setVideos] = useState(null);
  const [lb, setLb] = useState(null);
  const [o, setO] = useState({ title: '', body: '', tone: 'pink' });
  const [v, setV] = useState({ title: '', url: '', language: 'Hindi' });
  const load = () => { api('/admin/offers').then(setOffers); api('/admin/help-videos').then(setVideos); api('/admin/leaderboard').then(setLb); };
  useEffect(() => { load(); }, []);
  const run = async (fn, msg) => { try { await fn(); if (msg) toast(msg, 'success'); load(); } catch (e) { toast(e.message, 'error'); } };

  return (
    <>
      <h1>Offers & videos</h1>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>Offers (host app → Home → Offers)</h2>
        {offers?.map((x) => (
          <div key={x.id} className="txn">
            <div style={{ minWidth: 0 }}><b>{x.title}</b><div className="faint">{x.body}</div></div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-sm btn-outline" onClick={() => run(() => api(`/admin/offers/${x.id}`, { method: 'PATCH', body: { active: !x.active } }), x.active ? 'Hidden' : 'Shown')}>{x.active ? 'Hide' : 'Show'}</button>
              <button className="btn btn-sm btn-outline" onClick={() => confirm('Delete this offer?') && run(() => api(`/admin/offers/${x.id}`, { method: 'DELETE' }), 'Deleted')}>Delete</button>
            </div>
          </div>
        ))}
        <form className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); run(() => api('/admin/offers', { method: 'POST', body: o }), 'Offer added').then(() => setO({ title: '', body: '', tone: 'pink' })); }}>
          <input className="input" style={{ flex: '1 1 160px' }} placeholder="Title (e.g. Weekend bonus)" aria-label="Offer title" value={o.title} onChange={(e) => setO({ ...o, title: e.target.value })} required />
          <input className="input" style={{ flex: '2 1 260px' }} placeholder="Details shown to hosts" aria-label="Offer details" value={o.body} onChange={(e) => setO({ ...o, body: e.target.value })} required />
          <select className="input" style={{ flex: '0 0 110px' }} aria-label="Colour" value={o.tone} onChange={(e) => setO({ ...o, tone: e.target.value })}>{['pink', 'gold', 'blue', 'green'].map((t) => <option key={t}>{t}</option>)}</select>
          <button className="btn btn-primary btn-sm">Add offer</button>
        </form>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>Help videos (YouTube)</h2>
        {videos?.length === 0 && <p className="faint">No videos yet.</p>}
        {videos?.map((x) => (
          <div key={x.id} className="txn">
            <div className="row" style={{ minWidth: 0 }}><img src={`https://i.ytimg.com/vi/${x.youtube_id}/default.jpg`} alt="" width={64} height={48} style={{ borderRadius: 6 }} /><div><b>{x.title}</b><div className="faint">{x.language}</div></div></div>
            <button className="btn btn-sm btn-outline" onClick={() => confirm('Delete this video?') && run(() => api(`/admin/help-videos/${x.id}`, { method: 'DELETE' }), 'Deleted')}>Delete</button>
          </div>
        ))}
        <form className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); run(() => api('/admin/help-videos', { method: 'POST', body: v }), 'Video added').then(() => setV({ ...v, title: '', url: '' })); }}>
          <input className="input" style={{ flex: '1 1 160px' }} placeholder="Title" aria-label="Video title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required />
          <input className="input" style={{ flex: '2 1 240px' }} placeholder="YouTube link" aria-label="YouTube link" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} required />
          <input className="input" style={{ flex: '0 0 120px' }} placeholder="Language" aria-label="Language" value={v.language} onChange={(e) => setV({ ...v, language: e.target.value })} required />
          <button className="btn btn-primary btn-sm">Add video</button>
        </form>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>This week's top 10 hosts</h2>
        <p className="faint" style={{ marginBottom: 8 }}>Pay weekly bonuses from Hosts → Bonus.</p>
        {lb?.top.length ? lb.top.map((r) => <div key={r.id} className="txn"><span>#{r.rank} <b>{r.name}</b></span><b>{r.earned} coins</b></div>) : <p className="faint">No earnings yet this week.</p>}
      </div>
    </>
  );
}

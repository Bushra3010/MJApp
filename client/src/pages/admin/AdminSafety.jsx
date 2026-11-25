// Contact-sharing attempts by hosts (review, block, unblock) and member reviews of hosts.
import { useEffect, useState } from 'react';
import { api, timeAgo } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';

export default function AdminSafety() {
  const toast = useToast();
  const [v, setV] = useState(null);
  const [reviews, setReviews] = useState(null);
  const load = () => { api('/admin/violations').then(setV); api('/admin/reviews').then(setReviews); };
  useEffect(() => { load(); }, []);
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg, 'success'); load(); } catch (e) { toast(e.message, 'error'); } };
  const block = (x) => {
    const reason = prompt(`Block ${x.name}? Reason shown when they sign in`, 'Shared contact details with members');
    if (reason !== null) act(() => api(`/admin/hosts/${x.user_id}`, { method: 'PATCH', body: { status: 'blocked', reason } }), `${x.name} blocked`);
  };
  return (
    <>
      <h1>Safety</h1>
      <h2 className="admin-h2">Contact sharing attempts</h2>
      <p className="faint" style={{ marginBottom: 10 }}>Messages and profile text with phone numbers, WhatsApp, social handles, emails or links are never delivered. Hosts are warned, then blocked automatically after the limit set in Settings.</p>
      {!v ? <div className="spinner" /> : (
        <div className="card table-wrap" tabIndex={0} role="region" aria-label="Contact sharing attempts"><table className="t">
          <thead><tr><th>When</th><th>Host</th><th>What they tried to send</th><th>Detected</th><th>Account</th><th /></tr></thead>
          <tbody>{v.map((x) => (
            <tr key={x.id} style={x.status === 'reviewed' ? { opacity: 0.6 } : undefined}>
              <td className="muted">{timeAgo(x.created_at)}</td>
              <td><b>{x.name}</b><div className="faint">{x.email} · {x.total} total</div></td>
              <td style={{ maxWidth: 280, wordBreak: 'break-word' }}>{x.body}</td>
              <td><span className="chip chip-red">{x.reason}</span></td>
              <td>{x.user_status === 'blocked' ? <span className="chip chip-red" title={x.block_reason || ''}>blocked</span> : <span className="chip chip-green">active</span>}</td>
              <td><div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                {x.status === 'open' && <button className="btn btn-outline btn-sm" onClick={() => act(() => api(`/admin/violations/${x.id}`, { method: 'PATCH', body: { status: 'reviewed' } }))}>Mark reviewed</button>}
                {x.user_status === 'blocked'
                  ? <button className="btn btn-green btn-sm" onClick={() => act(() => api(`/admin/hosts/${x.user_id}`, { method: 'PATCH', body: { status: 'active' } }), `${x.name} unblocked`)}>Unblock</button>
                  : <button className="btn btn-outline btn-sm" onClick={() => block(x)}>Block</button>}
              </div></td>
            </tr>))}
            {v.length === 0 && <tr><td colSpan={6} className="faint">No attempts so far 👍</td></tr>}
          </tbody></table></div>
      )}
      <h2 className="admin-h2">Host reviews</h2>
      {!reviews ? <div className="spinner" /> : (
        <div className="card table-wrap" tabIndex={0} role="region" aria-label="Host reviews"><table className="t">
          <thead><tr><th>When</th><th>Host</th><th>Member</th><th>Stars</th><th>Review</th><th /></tr></thead>
          <tbody>{reviews.map((r) => (
            <tr key={r.id}>
              <td className="muted">{timeAgo(r.created_at)}</td><td><b>{r.host_name}</b></td><td>{r.user_name}</td>
              <td style={{ color: '#ffb020', whiteSpace: 'nowrap' }}>{'★'.repeat(r.stars)}<span style={{ opacity: 0.3 }}>{'★'.repeat(5 - r.stars)}</span></td>
              <td style={{ maxWidth: 320 }}>{r.body || <span className="faint">—</span>}</td>
              <td><button className="btn btn-outline btn-sm" onClick={() => confirm('Delete this review?') && act(() => api(`/admin/reviews/${r.id}`, { method: 'DELETE' }), 'Review deleted')}>Delete</button></td>
            </tr>))}
            {reviews.length === 0 && <tr><td colSpan={6} className="faint">No reviews yet</td></tr>}
          </tbody></table></div>
      )}
    </>
  );
}

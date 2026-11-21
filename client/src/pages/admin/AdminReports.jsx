import { useEffect, useState } from 'react';
import { api, timeAgo } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';

export default function AdminReports() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const load = () => api('/admin/reports').then(setRows);
  useEffect(() => { load(); }, []);
  const act = async (r, status, blockTarget) => {
    try {
      if (blockTarget) {
        const path = r.target_role === 'host' ? `/admin/hosts/${r.target_id}` : `/admin/users/${r.target_id}`;
        await api(path, { method: 'PATCH', body: { status: 'blocked' } });
      }
      await api(`/admin/reports/${r.id}`, { method: 'PATCH', body: { status } });
      toast('Report updated', 'success'); load();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <>
      <h1>Reports</h1>
      {!rows ? <div className="spinner" /> : (
        <div className="card table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="t">
          <thead><tr><th>When</th><th>Reporter</th><th>Reported</th><th>Reason</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td className="muted">{timeAgo(r.created_at)}</td>
              <td>{r.reporter_name} <span className="faint">({r.reporter_role})</span></td>
              <td>{r.target_name} <span className="faint">({r.target_role}{r.target_status === 'blocked' ? ', blocked' : ''})</span></td>
              <td>{r.reason}</td>
              <td><span className={`chip ${r.status === 'open' ? 'chip-amber' : 'chip-grey'}`}>{r.status}</span></td>
              <td>{r.status === 'open' && <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                <button className="btn btn-danger btn-sm" onClick={() => act(r, 'resolved', true)}>Block &amp; resolve</button>
                <button className="btn btn-outline btn-sm" onClick={() => act(r, 'dismissed')}>Dismiss</button>
              </div>}</td>
            </tr>))}
            {rows.length === 0 && <tr><td colSpan={6} className="faint">No reports — all quiet 🎉</td></tr>}
          </tbody></table></div>
      )}
    </>
  );
}

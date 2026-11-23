import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';

const FIELDS = [
  ['chat_cost', 'Coins per chat message', 'What a user pays to send one message. 0 makes chat free.'],
  ['host_share_pct', 'Host share (%)', 'Percent of every coin spent that the host earns.'],
  ['signup_bonus', 'Sign-up bonus coins', 'Free coins for new users.'],
  ['default_audio_rate', 'Default audio rate (coins/min)', 'Applied to newly created hosts.'],
  ['default_video_rate', 'Default video rate (coins/min)', 'Applied to newly created hosts.'],
  ['coin_to_inr', 'Payout value of 1 earned coin (₹)', 'Used to convert host earnings to rupees.'],
  ['referral_pct', 'Invite reward (%)', 'A host who invites another host earns this % of what the invited host earns (paid by Milo Julo).'],
  ['min_withdraw', 'Minimum withdrawal (coins)', 'Hosts can withdraw once their balance reaches this.'],
  ['free_trial_seconds', 'Free trial length (seconds)', "A new member's first call is free for this long. Billing starts after it; the host earns nothing during it."],
];
export default function AdminSettings() {
  const toast = useToast();
  const [s, setS] = useState(null);
  useEffect(() => { api('/admin/settings').then(setS); }, []);
  const save = async (e) => {
    e.preventDefault();
    try { setS(await api('/admin/settings', { method: 'PATCH', body: s })); toast('Settings saved', 'success'); } catch (err) { toast(err.message, 'error'); }
  };
  if (!s) return <div className="spinner" />;
  return (
    <>
      <h1>Settings</h1>
      <form className="card" style={{ padding: 20, maxWidth: 560 }} onSubmit={save}>
        <label className="check" style={{ alignItems: 'center', fontSize: 15, color: 'var(--text)' }}>
          <input type="checkbox" checked={Number(s.free_trial_enabled) === 1} onChange={(e) => setS({ ...s, free_trial_enabled: e.target.checked ? 1 : 0 })} />
          <span><b>Free trial for first-time members</b><br /><span className="faint">Once per member, first call only.</span></span>
        </label>
        {FIELDS.map(([k, label, help]) => (
          <div key={k} className="field">
            <label htmlFor={k}>{label}</label>
            <input id={k} className="input" type="number" step="any" min={0} value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
            <span className="faint">{help}</span>
          </div>
        ))}
        <button className="btn btn-primary">Save settings</button>
      </form>
      <LevelsEditor />
    </>
  );
}

function LevelsEditor() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/admin/levels').then(setRows); }, []);
  const set = (i, k) => (e) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: Number(e.target.value) } : r)));
  const save = async () => {
    try { setRows(await api('/admin/levels', { method: 'PUT', body: rows.map((r, i) => ({ ...r, level: i + 1 })) })); toast('Levels saved', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  };
  if (!rows) return null;
  return (
    <div className="card" style={{ padding: 20, maxWidth: 560, marginTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 4 }}>Host levels & call rates</h2>
      <p className="faint" style={{ marginBottom: 12 }}>Every Monday each host's level is set from last week's earnings. Hosts pick any rate up to their level.</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Levels">
        <table className="t">
          <thead><tr><th>Level</th><th>Weekly earnings ≥</th><th>Video /min</th><th>Audio /min</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}>
              <td>★ {i + 1}</td>
              <td><input className="rate-input" style={{ width: 100 }} type="number" min={0} value={r.weekly} disabled={i === 0} onChange={set(i, 'weekly')} aria-label={`Level ${i + 1} weekly earnings`} /></td>
              <td><input className="rate-input" type="number" min={0} value={r.video} onChange={set(i, 'video')} aria-label={`Level ${i + 1} video rate`} /></td>
              <td><input className="rate-input" type="number" min={0} value={r.audio} onChange={set(i, 'audio')} aria-label={`Level ${i + 1} audio rate`} /></td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn btn-outline btn-sm" onClick={() => { const l = rows[rows.length - 1]; setRows([...rows, { level: rows.length + 1, weekly: l.weekly * 2 || 500, video: l.video + 10, audio: l.audio + 3 }]); }}>+ Add level</button>
        {rows.length > 1 && <button className="btn btn-outline btn-sm" onClick={() => setRows(rows.slice(0, -1))}>Remove last</button>}
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={save}>Save levels</button>
      </div>
    </div>
  );
}

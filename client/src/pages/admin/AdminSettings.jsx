import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';

const FIELDS = [
  ['chat_cost', 'Coins per chat message', 'What a user pays to send one message. 0 makes chat free.'],
  ['host_share_pct', 'Host share of chats & gifts (%)', 'Percent of coins spent on chat messages and gifts that the host earns. Calls pay the host by level (below).'],
  ['signup_bonus', 'Sign-up bonus coins', 'Free coins for new users.'],
  ['coin_to_inr', 'Payout value of 1 earned coin (₹)', 'Used to convert host earnings to rupees.'],
  ['referral_pct', 'Invite reward (%)', 'A host who invites another host earns this % of what the invited host earns (paid by Milo Julo).'],
  ['min_withdraw_inr', 'Minimum withdrawal (₹)', 'Hosts can withdraw once their balance is worth this much.'],
  ['payout_sla_hours', 'Pay withdrawals within (hours)', 'Shown to hosts; requests older than this are marked overdue for admins.'],
  ['chat_limit', 'Chat messages per side', 'Each member and host can send this many messages in one chat, then only calls. 0 = no limit.'],
  ['contact_block_after', 'Ban host or member after … contact-sharing attempts', 'Messages with phone numbers, WhatsApp or other contact details are never sent. 1 = ban on the first attempt, 0 = only warn.'],
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
          <span><b>Free trial for first-time members</b><br /><span className="faint">Once per member and once per device, first call only.</span></span>
        </label>
        <label className="check" style={{ alignItems: 'center', fontSize: 15, color: 'var(--text)' }}>
          <input type="checkbox" checked={Number(s.require_host_verification) === 1} onChange={(e) => setS({ ...s, require_host_verification: e.target.checked ? 1 : 0 })} />
          <span><b>Hosts must be verified to go online</b><br /><span className="faint">ID + selfie checked by an admin, including gender.</span></span>
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
  const num = (r, i, k, label, w = 70, step = 1) => <input className="rate-input" style={{ width: w }} type="number" step={step} min={0} value={r[k]} disabled={k === 'target' && i === 0} onChange={set(i, k)} aria-label={`Level ${i + 1} ${label}`} />;
  return (
    <div className="card" style={{ padding: 20, maxWidth: 760, marginTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 4 }}>Host levels & call rates</h2>
      <p className="faint" style={{ marginBottom: 12 }}>A host moves up automatically when their total earnings (coins) reach the target, and never moves down. "Host earns" is paid per minute of call; "member pays" is the price members see.</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Levels">
        <table className="t">
          <thead><tr><th>Level</th><th>Target (coins earned)</th><th>Host earns audio ₹/min</th><th>Host earns video ₹/min</th><th>Member pays audio coins/min</th><th>Member pays video coins/min</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}>
              <td>★ {i + 1}</td>
              <td>{num(r, i, 'target', 'target', 110)}</td>
              <td>{num(r, i, 'audio_earn', 'host audio earning', 70, 0.5)}</td>
              <td>{num(r, i, 'video_earn', 'host video earning', 70, 0.5)}</td>
              <td>{num(r, i, 'audio', 'member audio price')}</td>
              <td>{num(r, i, 'video', 'member video price')}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn btn-outline btn-sm" onClick={() => { const l = rows[rows.length - 1]; setRows([...rows, { level: rows.length + 1, target: (l.target || 35000) * 2, audio_earn: l.audio_earn + 1, video_earn: l.video_earn + 1, audio: l.audio + 2, video: l.video + 5 }]); }}>+ Add level</button>
        {rows.length > 1 && <button className="btn btn-outline btn-sm" onClick={() => setRows(rows.slice(0, -1))}>Remove last</button>}
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={save}>Save levels</button>
      </div>
    </div>
  );
}

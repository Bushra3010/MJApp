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
        {FIELDS.map(([k, label, help]) => (
          <div key={k} className="field">
            <label htmlFor={k}>{label}</label>
            <input id={k} className="input" type="number" step="any" min={0} value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
            <span className="faint">{help}</span>
          </div>
        ))}
        <button className="btn btn-primary">Save settings</button>
      </form>
    </>
  );
}

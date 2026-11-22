// Languages the host speaks — members filter hosts by these.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import Icon from '../../components/Icon.jsx';

const LANGS = ['Hindi', 'English', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Gujarati', 'Punjabi', 'Odia', 'Bhojpuri', 'Urdu', 'Assamese'];

export default function HostLanguage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [sel, setSel] = useState((user.languages || '').split(',').map((s) => s.trim()).filter(Boolean));
  const [busy, setBusy] = useState(false);
  const toggle = (l) => setSel((x) => (x.includes(l) ? x.filter((y) => y !== l) : [...x, l]));
  const save = async () => {
    if (!sel.length) { toast('Pick at least one language', 'error'); return; }
    setBusy(true);
    try { setUser(await api('/me', { method: 'PATCH', body: { languages: sel.join(',') } })); toast('Languages saved', 'success'); nav(-1); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <>
      <header className="topbar"><button className="icon-btn press" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" /></button><h1>Language</h1></header>
      <div className="page">
        <p className="muted" style={{ marginBottom: 12 }}>Choose the languages you can talk in. Members can find you by language.</p>
        <div className="filters" style={{ flexWrap: 'wrap' }}>
          {LANGS.map((l) => <button key={l} type="button" className={sel.includes(l) ? 'on' : ''} aria-pressed={sel.includes(l)} onClick={() => toggle(l)}>{l}</button>)}
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save languages'}</button>
      </div>
    </>
  );
}

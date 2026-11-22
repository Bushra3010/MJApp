// Where host withdrawals are paid: UPI or a bank account (account number is stored securely and shown masked).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import Icon from '../../components/Icon.jsx';

export default function HostBank() {
  const { user, setUser } = useAuth();
  const hp = user.host || {};
  const toast = useToast();
  const nav = useNavigate();
  const [method, setMethod] = useState(hp.payout_method || 'upi');
  const [f, setF] = useState({ upi_id: hp.upi_id || '', bank_holder: hp.bank_holder || user.name, bank_account: '', bank_account2: '', bank_ifsc: hp.bank_ifsc || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault(); setError('');
    if (method === 'bank' && f.bank_account !== f.bank_account2) { setError("Account numbers don't match"); return; }
    setBusy(true);
    try {
      const body = method === 'upi' ? { method, upi_id: f.upi_id } : { method, bank_holder: f.bank_holder, bank_account: f.bank_account, bank_ifsc: f.bank_ifsc };
      const host = await api('/host/payout-details', { method: 'PUT', body });
      setUser((u) => ({ ...u, host: { ...u.host, ...host } }));
      toast('Payout details saved', 'success');
      nav(-1);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <>
      <header className="topbar"><button className="icon-btn press" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" /></button><h1>Bank details</h1></header>
      <div className="page">
        {hp.payout_method && (
          <div className="card" style={{ padding: 14, marginBottom: 14 }}>
            <span className="faint">Currently paid to</span>
            <b style={{ display: 'block' }}>{hp.payout_method === 'upi' ? `UPI · ${hp.upi_id}` : `${hp.bank_holder} · ••••${hp.bank_account_last4} · ${hp.bank_ifsc}`}</b>
          </div>
        )}
        <form className="card" style={{ padding: 16 }} onSubmit={save}>
          <div className="tabs" role="tablist" aria-label="Payout method">
            <button type="button" role="tab" aria-selected={method === 'upi'} className={method === 'upi' ? 'on' : ''} onClick={() => setMethod('upi')}>UPI</button>
            <button type="button" role="tab" aria-selected={method === 'bank'} className={method === 'bank' ? 'on' : ''} onClick={() => setMethod('bank')}>Bank account</button>
          </div>
          {method === 'upi' ? (
            <div className="field"><label htmlFor="upi">UPI ID</label><input id="upi" className="input" value={f.upi_id} onChange={set('upi_id')} placeholder="name@okbank" required autoComplete="off" /></div>
          ) : (<>
            <div className="field"><label htmlFor="holder">Account holder name</label><input id="holder" className="input" value={f.bank_holder} onChange={set('bank_holder')} required autoComplete="name" /></div>
            <div className="field"><label htmlFor="acc">Account number</label><input id="acc" className="input" inputMode="numeric" value={f.bank_account} onChange={set('bank_account')} required pattern="\d{9,18}" autoComplete="off" placeholder={hp.bank_account_last4 ? `••••${hp.bank_account_last4} (enter again to change)` : ''} /></div>
            <div className="field"><label htmlFor="acc2">Confirm account number</label><input id="acc2" className="input" inputMode="numeric" value={f.bank_account2} onChange={set('bank_account2')} required autoComplete="off" /></div>
            <div className="field"><label htmlFor="ifsc">IFSC code</label><input id="ifsc" className="input" value={f.bank_ifsc} onChange={(e) => setF({ ...f, bank_ifsc: e.target.value.toUpperCase() })} required placeholder="SBIN0001234" maxLength={11} autoComplete="off" /></div>
          </>)}
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <p className="faint" style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="shield" size={14} />Only our payouts team can see the full account number.</p>
        </form>
      </div>
    </>
  );
}

import { useState } from 'react';
import Sheet from './Sheet.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';

const REASONS = ['Shared phone number / contact details', 'Leaking app data or screenshots', 'Rude or abusive', 'Sexual or inappropriate content', 'Fake profile', 'Asking for money / scam', 'Under 18', 'Other'];

export default function ReportSheet({ target, onClose, onBlocked }) {
  const toast = useToast();
  const [step, setStep] = useState('menu');
  const report = async (reason) => {
    try { await api('/reports', { method: 'POST', body: { targetId: target.id, reason } }); toast('Thanks — our team will review this', 'success'); onClose(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const block = async () => {
    try { await api('/blocks', { method: 'POST', body: { targetId: target.id } }); toast(`${target.name} is blocked`, 'success'); onBlocked?.(); onClose(); }
    catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Sheet title={step === 'menu' ? target.name : `Report ${target.name}`} onClose={onClose}>
      <div className="menu-list">
        {step === 'menu' ? (<>
          <button onClick={() => setStep('report')}>🚩 Report</button>
          <button onClick={block} style={{ color: 'var(--red)' }}>⛔ Block</button>
          <button onClick={onClose}>Cancel</button>
        </>) : REASONS.map((r) => <button key={r} onClick={() => report(r)}>{r}</button>)}
      </div>
    </Sheet>
  );
}

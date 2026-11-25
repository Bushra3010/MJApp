import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import Icon from '../../components/Icon.jsx';

const links = [
  ['/admin', 'Dashboard', 'chart', true], ['/admin/users', 'Users', 'users'], ['/admin/hosts', 'Hosts', 'star'], ['/admin/verification', 'Verification', 'verified'],
  ['/admin/calls', 'Calls', 'phone'], ['/admin/reports', 'Reports', 'flag'], ['/admin/safety', 'Safety', 'shield'], ['/admin/payouts', 'Payouts', 'cash'], ['/admin/content', 'Offers & videos', 'play'], ['/admin/settings', 'Settings', 'gear'],
];
export default function AdminLayout() {
  const { logout, socket } = useAuth();
  // live count of verification requests waiting, shown as a badge in the menu
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    const load = () => api('/admin/stats').then((s) => setWaiting(s.pendingVerifications || 0)).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    socket?.on('admin:verification', load);
    window.addEventListener('mj:verification', load);
    return () => { clearInterval(t); socket?.off('admin:verification', load); window.removeEventListener('mj:verification', load); };
  }, [socket]);
  const badge = (to) => (to === '/admin/verification' && waiting > 0 ? <span className="badge nav-badge">{waiting}</span> : null);
  return (
    <div className="admin">
      <aside>
        <div className="brand"><img src="/icon-192.png" alt="" />Milo Julo Admin</div>
        {links.map(([to, label, icon, end]) => <NavLink key={to} to={to} end={end}><Icon name={icon} size={18} />{label}{badge(to)}</NavLink>)}
        <div className="spacer" />
        <button className="btn btn-outline btn-sm" onClick={logout}><Icon name="logout" size={16} />Log out</button>
      </aside>
      <div style={{ minWidth: 0 }}>
        <nav className="admin-mobile-nav">
          {links.map(([to, label, , end]) => <NavLink key={to} to={to} end={end}>{label}{badge(to)}</NavLink>)}
          <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>Log out</a>
        </nav>
        <main><Outlet /></main>
      </div>
    </div>
  );
}

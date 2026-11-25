import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import Icon from '../../components/Icon.jsx';

const links = [
  ['/admin', 'Dashboard', 'chart', true], ['/admin/users', 'Users', 'users'], ['/admin/hosts', 'Hosts', 'star'],
  ['/admin/calls', 'Calls', 'phone'], ['/admin/reports', 'Reports', 'flag'], ['/admin/safety', 'Safety', 'shield'], ['/admin/payouts', 'Payouts', 'cash'], ['/admin/content', 'Offers & videos', 'play'], ['/admin/settings', 'Settings', 'gear'],
];
export default function AdminLayout() {
  const { logout } = useAuth();
  return (
    <div className="admin">
      <aside>
        <div className="brand"><img src="/icon-192.png" alt="" />Milo Julo Admin</div>
        {links.map(([to, label, icon, end]) => <NavLink key={to} to={to} end={end}><Icon name={icon} size={18} />{label}</NavLink>)}
        <div className="spacer" />
        <button className="btn btn-outline btn-sm" onClick={logout}><Icon name="logout" size={16} />Log out</button>
      </aside>
      <div style={{ minWidth: 0 }}>
        <nav className="admin-mobile-nav">
          {links.map(([to, label, , end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
          <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>Log out</a>
        </nav>
        <main><Outlet /></main>
      </div>
    </div>
  );
}

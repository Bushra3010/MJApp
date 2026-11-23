import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useUnread } from '../../lib/useUnread.js';
import { useAlertCount } from '../../lib/useAlerts.js';

export default function HostShell() {
  const unread = useUnread();
  const alerts = useAlertCount();
  return (
    <div className="app-shell">
      <Outlet />
      <nav className="bottom-nav five" aria-label="Main">
        <NavLink to="/host" end><Icon name="home" size={24} /><span className="nav-t">Home</span></NavLink>
        <NavLink to="/host/chats"><Icon name="chat" size={24} /><span className="nav-t">Chats</span>{unread > 0 && <span className="badge">{unread}</span>}</NavLink>
        <NavLink to="/host/calls"><Icon name="phone" size={24} /><span className="nav-t">Calls</span></NavLink>
        <NavLink to="/host/alerts"><Icon name="bell" size={24} /><span className="nav-t">Alerts</span>{alerts > 0 && <span className="badge">{alerts}</span>}</NavLink>
        <NavLink to="/host/me"><Icon name="user" size={24} /><span className="nav-t">Account</span></NavLink>
      </nav>
    </div>
  );
}

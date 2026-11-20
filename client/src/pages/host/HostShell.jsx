import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useUnread } from '../../lib/useUnread.js';

export default function HostShell() {
  const unread = useUnread();
  return (
    <div className="app-shell">
      <Outlet />
      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/host" end><Icon name="home" />Home</NavLink>
        <NavLink to="/host/chats"><Icon name="chat" />Chats{unread > 0 && <span className="badge">{unread}</span>}</NavLink>
        <NavLink to="/host/earnings"><Icon name="cash" />Earnings</NavLink>
        <NavLink to="/host/me"><Icon name="user" />Me</NavLink>
      </nav>
    </div>
  );
}

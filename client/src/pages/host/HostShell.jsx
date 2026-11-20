import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useUnread } from '../../lib/useUnread.js';

export default function HostShell() {
  const unread = useUnread();
  return (
    <div className="app-shell">
      <Outlet />
      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/host" end><Icon name="home" size={24} />Home</NavLink>
        <NavLink to="/host/chats"><Icon name="chat" size={24} />Chats{unread > 0 && <span className="badge">{unread}</span>}</NavLink>
        <NavLink to="/host/earnings"><Icon name="cash" size={24} />Earnings</NavLink>
        <NavLink to="/host/me"><Icon name="user" size={24} />Me</NavLink>
      </nav>
    </div>
  );
}

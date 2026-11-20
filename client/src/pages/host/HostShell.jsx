import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useUnread } from '../../lib/useUnread.js';

export default function HostShell() {
  const unread = useUnread();
  return (
    <div className="app-shell">
      <Outlet />
      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/host" end><Icon name="home" size={25} /><span className="sr-only">Home</span></NavLink>
        <NavLink to="/host/chats"><Icon name="chat" size={25} /><span className="sr-only">Chats</span>{unread > 0 && <span className="badge">{unread}</span>}</NavLink>
        <NavLink to="/host/earnings"><Icon name="cash" size={25} /><span className="sr-only">Earnings</span></NavLink>
        <NavLink to="/host/me"><Icon name="user" size={25} /><span className="sr-only">Me</span></NavLink>
      </nav>
    </div>
  );
}

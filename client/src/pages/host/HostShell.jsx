import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useUnread } from '../../lib/useUnread.js';

export default function HostShell() {
  const unread = useUnread();
  return (
    <div className="app-shell">
      <Outlet />
      <nav className="bottom-nav five" aria-label="Main">
        <NavLink to="/host" end><Icon name="home" size={24} /><span className="nav-t">Home</span></NavLink>
        <NavLink to="/host/history"><Icon name="history" size={24} /><span className="nav-t">History</span></NavLink>
        <NavLink to="/host/chats"><Icon name="chat" size={24} /><span className="nav-t">Chats</span>{unread > 0 && <span className="badge">{unread}</span>}</NavLink>
        <NavLink to="/host/wallet"><Icon name="wallet" size={24} /><span className="nav-t">Wallet</span></NavLink>
        <NavLink to="/host/me"><Icon name="user" size={24} /><span className="nav-t">Profile</span></NavLink>
      </nav>
    </div>
  );
}

import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useUnread } from '../../lib/useUnread.js';

export default function UserShell() {
  const unread = useUnread();
  return (
    <div className="app-shell">
      <Outlet />
      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/app" end><Icon name="home" size={25} /><span className="sr-only">Discover</span></NavLink>
        <NavLink to="/app/chats"><Icon name="chat" size={25} /><span className="sr-only">Chats</span>{unread > 0 && <span className="badge">{unread}</span>}</NavLink>
        <NavLink to="/app/wallet"><Icon name="wallet" size={25} /><span className="sr-only">Wallet</span></NavLink>
        <NavLink to="/app/me"><Icon name="user" size={25} /><span className="sr-only">Me</span></NavLink>
      </nav>
    </div>
  );
}

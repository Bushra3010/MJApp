import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useUnread } from '../../lib/useUnread.js';

export default function UserShell() {
  const unread = useUnread();
  return (
    <div className="app-shell">
      <Outlet />
      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/app" end><Icon name="home" />Discover</NavLink>
        <NavLink to="/app/chats"><Icon name="chat" />Chats{unread > 0 && <span className="badge">{unread}</span>}</NavLink>
        <NavLink to="/app/wallet"><Icon name="wallet" />Wallet</NavLink>
        <NavLink to="/app/me"><Icon name="user" />Me</NavLink>
      </nav>
    </div>
  );
}

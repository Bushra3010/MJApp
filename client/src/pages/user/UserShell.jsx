import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import AvailabilityPopup from '../../components/AvailabilityPopup.jsx';
import { useUnread } from '../../lib/useUnread.js';

export default function UserShell() {
  const unread = useUnread();
  return (
    <div className="app-shell">
      <AvailabilityPopup />
      <Outlet />
      <nav className="bottom-nav labeled" aria-label="Main">
        <NavLink to="/app" end><Icon name="home" size={24} /><span>Discover</span></NavLink>
        <NavLink to="/app/match"><Icon name="heart" size={24} /><span>Match</span></NavLink>
        <NavLink to="/app/chats"><Icon name="chat" size={24} /><span>Messages</span>{unread > 0 && <span className="badge">{unread}</span>}</NavLink>
        <NavLink to="/app/me"><Icon name="user" size={24} /><span>Me</span></NavLink>
      </nav>
    </div>
  );
}

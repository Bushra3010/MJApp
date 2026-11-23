import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { CallProvider } from './lib/call.jsx';
import CallOverlay from './components/CallOverlay.jsx';
import Landing from './pages/Landing.jsx';
import HostLanding from './pages/host/HostLanding.jsx';
import { APP } from './apps.js';
import Login from './pages/Login.jsx';
import Reset from './pages/Reset.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import Legal from './pages/Legal.jsx';
import Settings from './pages/Settings.jsx';
import UserShell from './pages/user/UserShell.jsx';
import Discover from './pages/user/Discover.jsx';
import HostProfile from './pages/user/HostProfile.jsx';
import Wallet from './pages/user/Wallet.jsx';
import Chats from './pages/Chats.jsx';
import ChatThread from './pages/ChatThread.jsx';
import Me from './pages/Me.jsx';
import CallHistory from './pages/CallHistory.jsx';
import HostShell from './pages/host/HostShell.jsx';
import HostHome from './pages/host/HostHome.jsx';
import HostWallet from './pages/host/HostWallet.jsx';
import HostHistory from './pages/host/HostHistory.jsx';
import HostBank from './pages/host/HostBank.jsx';
import HostVerification from './pages/host/HostVerification.jsx';
import HostLanguage from './pages/host/HostLanguage.jsx';
import HostRate from './pages/host/HostRate.jsx';
import HostAlerts from './pages/host/HostAlerts.jsx';
import HostLeaderboard from './pages/host/HostLeaderboard.jsx';
import HostInvite from './pages/host/HostInvite.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminHosts from './pages/admin/AdminHosts.jsx';
import AdminCalls from './pages/admin/AdminCalls.jsx';
import AdminReports from './pages/admin/AdminReports.jsx';
import AdminPayouts from './pages/admin/AdminPayouts.jsx';
import AdminSettings from './pages/admin/AdminSettings.jsx';
import AdminContent from './pages/admin/AdminContent.jsx';


function Guard({ role, children }) {
  const { user } = useAuth();
  if (!user || (role && user.role !== role)) return <Navigate to="/login" replace />;
  return children;
}

const home = { user: '/app', host: '/host', admin: '/admin' }[APP];
const landing = { user: <Landing />, host: <HostLanding />, admin: <Navigate to="/login" replace /> }[APP];

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="spinner" />;
  return (
    <CallProvider>
      <Routes>
        <Route path="/" element={user ? <Navigate to={home} replace /> : landing} />
        <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {['terms', 'privacy', 'refunds', 'guidelines', 'contact'].map((p) => <Route key={p} path={`/${p}`} element={<Legal />} />)}

        {APP === 'user' && <>
          <Route path="/app" element={<Guard role="user"><UserShell /></Guard>}>
            <Route index element={<Discover />} />
            <Route path="chats" element={<Chats />} />
            <Route path="wallet" element={<Wallet />} />
            <Route path="me" element={<Me />} />
            <Route path="calls" element={<CallHistory />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/app/host/:id" element={<Guard role="user"><HostProfile /></Guard>} />
          <Route path="/app/chat/:id" element={<Guard role="user"><ChatThread /></Guard>} />
        </>}

        {APP === 'host' && <>
          <Route path="/host" element={<Guard role="host"><HostShell /></Guard>}>
            <Route index element={<HostHome />} />
            <Route path="chats" element={<Chats />} />
            <Route path="wallet" element={<HostWallet />} />
            <Route path="earnings" element={<Navigate to="/host/wallet" replace />} />
            <Route path="calls" element={<HostHistory />} />
            <Route path="history" element={<Navigate to="/host/calls" replace />} />
            <Route path="alerts" element={<HostAlerts />} />
            <Route path="me" element={<Me />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/host/chat/:id" element={<Guard role="host"><ChatThread /></Guard>} />
          <Route path="/host/bank" element={<Guard role="host"><HostBank /></Guard>} />
          <Route path="/host/verification" element={<Guard role="host"><HostVerification /></Guard>} />
          <Route path="/host/language" element={<Guard role="host"><HostLanguage /></Guard>} />
          <Route path="/host/rate" element={<Guard role="host"><HostRate /></Guard>} />
          <Route path="/host/leaderboard" element={<Guard role="host"><HostLeaderboard /></Guard>} />
          <Route path="/host/invite" element={<Guard role="host"><HostInvite /></Guard>} />
        </>}

        {APP === 'admin' && (
          <Route path="/admin" element={<Guard role="admin"><AdminLayout /></Guard>}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="hosts" element={<AdminHosts />} />
            <Route path="calls" element={<AdminCalls />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="payouts" element={<AdminPayouts />} />
            <Route path="content" element={<AdminContent />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {APP !== 'admin' && <CallOverlay />}
    </CallProvider>
  );
}

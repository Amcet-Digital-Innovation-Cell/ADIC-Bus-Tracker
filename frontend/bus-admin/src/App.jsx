import { useState, useEffect } from 'react';
import { Menu, Home, Bus, LogOut } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Buses from './pages/BusesPage';
import Login from './pages/login';
import Profile from './pages/Profile';
import LogoutModal from './components/LogoutModal';
import { useSocketBus } from './hooks/useSocketBus';
import supabase from './lib/supabaseClient';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'https://bustransit-g4ks.onrender.com';

// ── Map Supabase column names → frontend field names ─────────────────────
const mapFromDb = (row) => ({
  id: row.id,
  busId: row.bus_number ? String(row.bus_number).toUpperCase() : '',
  busNo: row.registration_number ? String(row.registration_number).replace(/\s+/g, '').toUpperCase() : '',
  driver: row.driver_name ? String(row.driver_name).toUpperCase() : '',
  contact: row.driver_phone ? String(row.driver_phone).toUpperCase() : '',
  route: row.route_name ? String(row.route_name).toUpperCase() : '',
  route_id: row.route_id || '',
  license: row.license_number ? String(row.license_number).toUpperCase() : '',
  status: row.status || 'Pending (GPS)',
  latitude: row.latitude,
  longitude: row.longitude,
  stops: Array.isArray(row.stops)
    ? row.stops.map((s, idx) => ({
        id: s.id || idx,
        stop_name: (s.stop_name || s || '').toUpperCase(),
        stop_order: s.stop_order || idx + 1,
        latitude: s.latitude || null,
        longitude: s.longitude || null,
      }))
    : (Array.isArray(row.bus_stops)
        ? row.bus_stops.map((s, idx) => ({
            id: s.id || idx,
            stop_name: (s.stop_name || s || '').toUpperCase(),
            stop_order: s.stop_order || idx + 1,
            latitude: s.latitude || null,
            longitude: s.longitude || null,
          }))
        : []),
});

/**
 * App — Root component.
 */
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => sessionStorage.getItem('isLoggedIn') === 'true');
  const [userEmail, setUserEmail] = useState(() => sessionStorage.getItem('userEmail') || 'admin@example.com');
  const [authToken, setAuthToken] = useState(() => sessionStorage.getItem('authToken') || null);
  const [rawBuses, setRawBuses] = useState([]);
  const [currentPage, setCurrentPage] = useState('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // ── Real-time GPS updates + smooth interpolation ──────────────────────
  const { buses } = useSocketBus(rawBuses, authToken);

  const navigationItems = [
    { name: 'Dashboard', icon: Home },
    { name: 'Buses', icon: Bus },
  ];

  // ── Fetch initial bus list from backend ───────────────────────────────
  useEffect(() => {
    if (!isLoggedIn || !authToken) return;

    const fetchBuses = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/buses`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) throw new Error(`Failed to load buses (${res.status})`);
        const json = await res.json();
        const data = json.data || json;
        setRawBuses(Array.isArray(data) ? data.map(mapFromDb) : []);
      } catch (err) {
        console.error('[App] fetchBuses:', err.message);
      }
    };

    fetchBuses();
  }, [isLoggedIn, authToken]);

  const renderPage = () => {
    switch (currentPage) {
      case 'Dashboard': return <Dashboard buses={buses} authToken={authToken} />;
      case 'Buses': return <Buses buses={buses} setBuses={setRawBuses} />;
      default: return <Dashboard buses={buses} authToken={authToken} />;
    }
  };

  // ── Handle logout ─────────────────────────────────────────────────────
  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    setIsLoggedIn(false);
    setAuthToken(null);
    setRawBuses([]);
    setShowLogoutModal(false);
  };

  // ── Login gate ────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <Login
        onLogin={({ email, token }) => {
          sessionStorage.setItem('isLoggedIn', 'true');
          sessionStorage.setItem('userEmail', email);
          sessionStorage.setItem('authToken', token);
          setUserEmail(email);
          setAuthToken(token);
          setIsLoggedIn(true);
        }}
      />
    );
  }

  // Initials for avatar
  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : 'AD';

  return (
    <div className="app-shell">

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className={`app-sidebar${sidebarOpen ? ' app-sidebar--open' : ' app-sidebar--collapsed'}`}>
        {/* Logo / Toggle row */}
        <div className="sidebar-brand">
          {sidebarOpen && (
            <span className="sidebar-brand__name">AmcetTransit</span>
          )}
          <button
            id="sidebar-toggle"
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <Menu size={20} strokeWidth={2} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navigationItems.map(item => {
            const IconComponent = item.icon;
            const isActive = currentPage === item.name;
            return (
              <div
                key={item.name}
                id={`nav-${item.name.toLowerCase()}`}
                className={`sidebar-nav__item${isActive ? ' sidebar-nav__item--active' : ''}`}
                onClick={() => setCurrentPage(item.name)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setCurrentPage(item.name)}
                aria-current={isActive ? 'page' : undefined}
                title={!sidebarOpen ? item.name : undefined}
              >
                <span className="sidebar-nav__icon">
                  <IconComponent size={19} strokeWidth={2} />
                </span>
                {sidebarOpen && (
                  <span className="sidebar-nav__label">{item.name}</span>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ── Main Content ────────────────────────────────────────────── */}
      <div className="app-main">

        {/* Header */}
        <header className="app-header">
          <h1 className="app-header__title">{currentPage}</h1>

          <div className="app-header__actions">
            {/* Logout icon button */}
            <button
              id="logout-btn"
              title="Logout"
              className="icon-btn icon-btn--danger"
              onClick={() => setShowLogoutModal(true)}
            >
              <LogOut size={17} strokeWidth={2} />
            </button>

            {/* Profile avatar */}
            <div
              id="profile-avatar"
              className="app-header__avatar"
              onClick={() => setShowProfileModal(true)}
              role="button"
              tabIndex={0}
              title="View profile"
            >
              {initials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="app-content">
          {renderPage()}
        </main>
      </div>

      {/* Logout modal */}
      <LogoutModal
        isOpen={showLogoutModal}
        onCancel={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
      />

      {/* Profile modal */}
      <Profile
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        email={userEmail}
      />
    </div>
  );
}

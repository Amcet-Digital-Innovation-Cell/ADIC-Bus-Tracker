import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import { Menu, Home, Bus, Route as RouteIcon, GraduationCap, LogOut } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Buses from './pages/BusesPage';
import RoutesPage from './pages/RoutesPage';
import StudentsPage from './pages/StudentsPage';
import Login from './pages/login';
import Profile from './pages/Profile';
import LogoutModal from './components/LogoutModal';
import { useSocketBus } from './hooks/useSocketBus';
import supabase from './lib/supabaseClient';
import apiClient, { AUTH_EXPIRED_EVENT } from './lib/apiClient';
import './App.css';

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
        id: s.id || idx + 1,
        stop_name: (typeof s === 'string' ? s : (s.stop_name || s.name || '')).toUpperCase(),
        stop_order: s.stop_order !== undefined ? Number(s.stop_order) : idx + 1,
        latitude: s.latitude || null,
        longitude: s.longitude || null,
      }))
    : [],
});

/**
 * App — Root component with persistent dark sidebar navigation & routing.
 */
export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(() => sessionStorage.getItem('isLoggedIn') === 'true');
  const [userEmail, setUserEmail] = useState(() => sessionStorage.getItem('userEmail') || 'admin@example.com');
  const [authToken, setAuthToken] = useState(() => sessionStorage.getItem('authToken') || null);
  const [rawBuses, setRawBuses] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > 900;
    }
    return true;
  });
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // ── Synchronize Supabase Auth state & handle automatic session renewal ───
  useEffect(() => {
    let isMounted = true;

    // Check active Supabase session
    if (supabase?.auth?.getSession) {
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (!isMounted) return;
        if (error || !session) {
          // If no active Supabase session exists, strictly clear credentials
          setIsLoggedIn(false);
          setAuthToken(null);
          sessionStorage.clear();
        } else if (session) {
          setIsLoggedIn(true);
          setAuthToken(session.access_token);
          if (session.user?.email) {
            setUserEmail(session.user.email);
            sessionStorage.setItem('userEmail', session.user.email);
          }
          sessionStorage.setItem('authToken', session.access_token);
          sessionStorage.setItem('isLoggedIn', 'true');
        }
      }).catch((err) => {
        console.warn('[App] getSession error:', err);
      });
    }

    // Subscribe to Supabase auth events (TOKEN_REFRESHED, SIGNED_OUT, etc.)
    let authSubscription = null;
    if (supabase?.auth?.onAuthStateChange) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (!isMounted) return;
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
          if (session?.access_token) {
            setAuthToken(session.access_token);
            sessionStorage.setItem('authToken', session.access_token);
            setIsLoggedIn(true);
            if (session.user?.email) {
              setUserEmail(session.user.email);
              sessionStorage.setItem('userEmail', session.user.email);
            }
          }
        } else if (event === 'SIGNED_OUT') {
          setIsLoggedIn(false);
          setAuthToken(null);
          sessionStorage.clear();
          localStorage.removeItem('authToken');
          localStorage.removeItem('amcet-transit-auth');
        }
      });
      authSubscription = data?.subscription;
    }

    // Listen to global 401 token expiry event dispatched by apiClient
    const handleAuthExpired = () => {
      console.warn('[App] Session expired event detected. Resetting to login.');
      setIsLoggedIn(false);
      setAuthToken(null);
      sessionStorage.clear();
      localStorage.removeItem('authToken');
      localStorage.removeItem('amcet-transit-auth');
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);

    return () => {
      isMounted = false;
      if (authSubscription?.unsubscribe) authSubscription.unsubscribe();
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, []);

  // Auto-close sidebar drawer on route navigation on smaller screens
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 900) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  // ── Real-time GPS updates + smooth interpolation ──────────────────────
  const { buses } = useSocketBus(rawBuses, authToken);

  // ── Persistent Navigation Items with Dark Theme Sidebar Styling ───────
  const navigationItems = [
    { name: 'Dashboard', path: '/dashboard', icon: Home, matchPaths: ['/', '/dashboard'] },
    { name: 'Buses', path: '/buses', icon: Bus, matchPaths: ['/buses'] },
    { name: 'Routes', path: '/routes', icon: RouteIcon, matchPaths: ['/routes'] },
    { name: 'Students', path: '/students', icon: GraduationCap, matchPaths: ['/students'] },
  ];

  // ── Fetch initial bus list from backend using apiClient ───────────────
  useEffect(() => {
    if (!isLoggedIn) return;

    let isMounted = true;
    const fetchBuses = async () => {
      try {
        const json = await apiClient.get('/api/buses');
        if (!isMounted) return;
        const data = json.data || json;
        setRawBuses(Array.isArray(data) ? data.map(mapFromDb) : []);
      } catch (err) {
        console.error('[App] fetchBuses error:', err.message);
      }
    };

    fetchBuses();

    return () => {
      isMounted = false;
    };
  }, [isLoggedIn, authToken]);

  // Dynamic Header Title
  const getHeaderTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/students')) return 'Students';
    if (path.startsWith('/buses')) return 'Buses';
    if (path.startsWith('/routes')) return 'Routes';
    return 'Dashboard';
  };

  // ── Handle logout ─────────────────────────────────────────────────────
  const handleLogout = async () => {
    if (supabase?.auth?.signOut) {
      await supabase.auth.signOut().catch(() => {});
    }
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

      {/* ── Persistent Dark Theme Sidebar ─────────────────────────────── */}
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

        {/* Navigation List */}
        <nav className="sidebar-nav">
          {navigationItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = item.matchPaths.includes(location.pathname);

            return (
              <div
                key={item.name}
                id={`nav-${item.name.toLowerCase()}`}
                className={`sidebar-nav__item${isActive ? ' sidebar-nav__item--active' : ''}`}
                onClick={() => {
                  navigate(item.path);
                  if (typeof window !== 'undefined' && window.innerWidth <= 900) {
                    setSidebarOpen(false);
                  }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    navigate(item.path);
                    if (typeof window !== 'undefined' && window.innerWidth <= 900) {
                      setSidebarOpen(false);
                    }
                  }
                }}
                aria-current={isActive ? 'page' : undefined}
                title={!sidebarOpen ? item.name : undefined}
              >
                <span className="sidebar-nav__icon">
                  <IconComponent size={19} strokeWidth={2} />
                </span>
                {sidebarOpen && (
                  <div className="sidebar-nav__label-wrap">
                    <span className="sidebar-nav__label">{item.name}</span>
                    {item.sublabel && (
                      <span className="sidebar-nav__sublabel">{item.sublabel}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ── Mobile Drawer Backdrop Overlay ───────────────────────── */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Main Content Area ────────────────────────────────────────── */}
      <div className="app-main">

        {/* Top Header */}
        <header className="app-header">
          <div className="app-header__left">
            <button
              id="mobile-sidebar-toggle"
              className="mobile-hamburger-btn"
              onClick={() => setSidebarOpen((prev) => !prev)}
              title={sidebarOpen ? 'Close navigation' : 'Open navigation'}
              aria-label="Toggle navigation menu"
            >
              <Menu size={20} strokeWidth={2.2} />
            </button>
            <h1 className="app-header__title">{getHeaderTitle()}</h1>
          </div>

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

        {/* Page Routing Outlet */}
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Dashboard buses={buses} authToken={authToken} />} />
            <Route path="/dashboard" element={<Dashboard buses={buses} authToken={authToken} />} />
            <Route path="/buses" element={<Buses buses={buses} setBuses={setRawBuses} />} />
            <Route path="/routes" element={<RoutesPage />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
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

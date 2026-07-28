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

const API_BASE = import.meta.env.VITE_API_URL || 'https://bus-tracking-zbon.onrender.com';

/**
 * Helper to get the stored Supabase JWT token.
 */
const getToken = () => sessionStorage.getItem('authToken');

/**
 * App — Root component.
 *
 * Changes from v1:
 *   - Buses are now fetched from the backend API in App.jsx (was in BusesPage)
 *   - useSocketBus hook manages real-time GPS updates + interpolation
 *   - Login delegates to Supabase directly (no backend auth endpoint)
 *   - Logout signs out from Supabase session
 */
export default function App() {
  const [isLoggedIn, setIsLoggedIn]             = useState(() => sessionStorage.getItem('isLoggedIn') === 'true');
  const [userEmail, setUserEmail]               = useState(() => sessionStorage.getItem('userEmail') || 'admin@example.com');
  const [authToken, setAuthToken]               = useState(() => sessionStorage.getItem('authToken') || null);
  const [rawBuses, setRawBuses]                 = useState([]);
  const [currentPage, setCurrentPage]           = useState('Dashboard');
  const [sidebarOpen, setSidebarOpen]           = useState(true);
  const [showLogoutModal, setShowLogoutModal]   = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // ── Real-time GPS updates + smooth interpolation ───────────────────────
  // Wraps rawBuses with Socket.IO listener and client-side interpolation.
  // `buses` should be used everywhere in the UI (includes live GPS positions).
  const { buses, connected } = useSocketBus(rawBuses, authToken);

  const navigationItems = [
    { name: 'Dashboard', icon: Home },
    { name: 'Buses', icon: Bus },
  ];

  // ── Fetch initial bus list from backend ─────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn || !authToken) return;

    const fetchBuses = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/buses`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) throw new Error(`Failed to load buses (${res.status})`);
        const json = await res.json();
        // Backend now returns { success, data, message } shape
        const data = json.data || json;
        setRawBuses(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('[App] fetchBuses:', err.message);
      }
    };

    fetchBuses();
  }, [isLoggedIn, authToken]);

  const renderPage = () => {
    switch (currentPage) {
      case 'Dashboard': return <Dashboard buses={buses} />;
      case 'Buses':     return <Buses buses={buses} setBuses={setRawBuses} />;
      default:          return <Dashboard buses={buses} />;
    }
  };

  // ── Handle logout ─────────────────────────────────────────────────────
  const handleLogout = async () => {
    // Sign out from Supabase session
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

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#f5f5f5' }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? '250px' : '70px',
        backgroundColor: '#2c3e50',
        color: 'white',
        transition: 'width 0.3s ease',
        overflowY: 'auto',
        position: 'relative'
      }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {sidebarOpen && <h2 style={{ margin: 0, fontSize: '18px' }}>AmcetTransit</h2>}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '20px' }}
          >
            <Menu size={24} />
          </button>
        </div>

        <nav style={{ padding: '20px 0' }}>
          {navigationItems.map(item => {
            const IconComponent = item.icon;
            return (
              <div
                key={item.name}
                onClick={() => setCurrentPage(item.name)}
                style={{
                  padding: '15px 20px',
                  cursor: 'pointer',
                  backgroundColor: currentPage === item.name ? 'rgba(255,255,255,0.1)' : 'transparent',
                  borderLeft: currentPage === item.name ? '4px solid #3498db' : '4px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '15px',
                  transition: 'all 0.2s ease',
                  fontSize: '14px',
                  whiteSpace: 'nowrap'
                }}
              >
                <IconComponent size={20} />
                {sidebarOpen && item.name}
              </div>
            );
          })}
        </nav>

        {/* Socket.IO connection indicator */}
        {sidebarOpen && (
          <div style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: connected ? '#4CAF50' : '#f44336',
          }}>
            <span style={{
              width: '7px', height: '7px',
              borderRadius: '50%',
              background: connected ? '#4CAF50' : '#f44336',
              display: 'inline-block',
            }} />
            {connected ? 'Live' : 'Offline'}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <header style={{
          backgroundColor: 'white',
          padding: '20px 30px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#2c3e50' }}>{currentPage}</h1>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {/* Logout button */}
            <button
              title="Logout"
              onClick={() => setShowLogoutModal(true)}
              style={{
                width: '38px', height: '38px', borderRadius: '10px',
                border: '1px solid #e2e8f0', backgroundColor: '#ffffff',
                color: '#718096', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = '#fff5f5';
                e.currentTarget.style.color = '#e53e3e';
                e.currentTarget.style.borderColor = '#fed7d7';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(229,62,62,0.14)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.color = '#718096';
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
              }}
            >
              <LogOut size={18} strokeWidth={2} />
            </button>

            {/* Profile avatar */}
            <div 
              onClick={() => setShowProfileModal(true)}
              style={{
                width: '38px', height: '38px', borderRadius: '50%',
                backgroundColor: '#3498db', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 'bold', cursor: 'pointer', fontSize: '14px',
                boxShadow: '0 1px 3px rgba(52,152,219,0.3)',
              }}
            >
              AD
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div style={{
          flex: 1, overflow: 'hidden', display: 'flex',
          flexDirection: 'column', padding: '20px 30px',
          backgroundColor: '#f5f5f5'
        }}>
          {renderPage()}
        </div>
      </div>

      {/* Logout confirmation modal */}
      <LogoutModal
        isOpen={showLogoutModal}
        onCancel={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
      />

      {/* Profile modal popup */}
      <Profile
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        email={userEmail}
      />
    </div>
  );
}

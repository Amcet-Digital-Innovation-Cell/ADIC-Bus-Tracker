import { useState, useEffect } from 'react';
import { Bus, Radio, GraduationCap, Map, X, Maximize2 } from 'lucide-react';
import MapView from '../components/MapView';
import BusList from '../components/BusList';
import BusInfoCard from '../components/BusInfoCard';
import TrackLocationView from '../components/TrackLocationView';
import { studentService } from '../lib/studentService';
import supabase from '../lib/supabaseClient';
import './Dashboard.css';

function KpiCard({ variant, icon: Icon, iconColor, label, value, sub }) {
  return (
    <div className={`kpi-card kpi-card--${variant}`}>
      <div className="kpi-card__top">
        <span className="kpi-card__label">{label}</span>
        <div className="kpi-card__icon">
          <Icon size={18} color={iconColor} strokeWidth={2} />
        </div>
      </div>
      <div className="kpi-card__value">{value}</div>
      <div className="kpi-card__sub">{sub}</div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Dashboard page
───────────────────────────────────────── */
export default function Dashboard({ buses, authToken }) {
  const totalBuses = buses.length;
  const activeBuses = buses.filter(b => b.status === 'Active' || b.status === 'active').length;
  const offline = buses.filter(b => b.status === 'Inactive' || b.status === 'inactive' || b.status === 'Pending (GPS)').length;

  // totalStudents dynamically loaded from studentService / Supabase
  const [totalStudents, setTotalStudents] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const updateStudentCount = () => {
      studentService.fetchStudents().then(list => {
        if (isMounted && Array.isArray(list)) setTotalStudents(list.length);
      }).catch(() => {});
    };

    // 1. Initial count on mount
    updateStudentCount();

    // 2. Realtime listener: only updates when a student is added/removed in DB
    let channel = null;
    if (typeof supabase?.channel === 'function') {
      try {
        channel = supabase
          .channel('dashboard-students-count')
          .on('postgres_changes', { event: '*', schema: 'bus_tracking', table: 'students' }, () => {
            updateStudentCount();
          })
          .subscribe();
      } catch (_) {}
    }

    return () => {
      isMounted = false;
      if (channel && typeof supabase?.removeChannel === 'function') {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const [isMapFullscreen, setIsMapFullscreen] = useState(false);

  // Lifted from BusList — shared with BusInfoCard
  const [selectedId, setSelectedId] = useState(null);
  const handleSelect = (id) => setSelectedId((prev) => (prev === id ? null : id));
  const selectedBus = buses.find((b) => b.id === selectedId) ?? null;

  // Track Location full-screen state
  const [isTracking, setIsTracking] = useState(false);
  const handleTrackLocation = () => { if (selectedBus) setIsTracking(true); };
  const handleCloseTracking = () => setIsTracking(false);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="dashboard-content">

      {/* ── Overview text — above the grid, left-column only ── */}
      <div className="dash-header">
        <p className="dash-title">
          Overview of fleet activity for <strong style={{ color: '#4a5568' }}>{today}</strong>
        </p>
      </div>

      {/* ── Two-column grid ───────────────────────── */}
      <div className="dash-grid">

        {/* ══════════════ LEFT (60%) ══════════════ */}
        <div className="dash-left">

          {/* KPI row */}
          <div className="kpi-row">
            <KpiCard
              variant="total"
              icon={Bus}
              iconColor="#3498db"
              label="Total Buses"
              value={totalBuses}
            />
            <KpiCard
              variant="active"
              icon={Radio}
              iconColor="#2d9e5f"
              label="Active Now"
              value={activeBuses}
              sub={`${offline} inactive`}
            />
            <KpiCard
              variant="students"
              icon={GraduationCap}
              iconColor="#6d28d9"
              label="Total Students"
              value={totalStudents.toLocaleString()}

            />
          </div>

          {/* Live Fleet Map */}
          <div className="map-card">
            <div className="map-card__header">
              <div className="map-card__title">
                <div className="map-card__title-icon">
                  <Map size={15} color="#ffffff" strokeWidth={2} />
                </div>
                <h2>Live Fleet Map</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="map-legend">
                  <div className="map-legend__item">
                    <div className="map-legend__dot" style={{ background: '#4CAF50' }} />
                    Active
                  </div>
                  <div className="map-legend__item">
                    <div className="map-legend__dot" style={{ background: '#f44336' }} />
                    Inactive
                  </div>
                </div>
                <button
                  className="map-expand-btn"
                  title="Expand map"
                  onClick={() => setIsMapFullscreen(true)}
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>
            <div className="map-card__body">
              <MapView buses={buses} />
            </div>
          </div>

          {/* ── Fullscreen Map Overlay ─────────────────────── */}
          {isMapFullscreen && (
            <div className="map-fullscreen-overlay">
              <div className="map-fullscreen-inner" onClick={(e) => e.stopPropagation()}>
                {/* Close button — top-right corner */}
                <button
                  className="map-fullscreen-close"
                  onClick={() => setIsMapFullscreen(false)}
                  title="Close fullscreen"
                >
                  <X size={20} strokeWidth={2.5} />
                </button>
                {/* Map header strip */}
                <div className="map-fullscreen-header">
                  <div className="map-card__title">
                    <div className="map-card__title-icon">
                      <Map size={15} color="#ffffff" strokeWidth={2} />
                    </div>
                    <h2>Live Fleet Map</h2>
                  </div>
                  <div className="map-legend">
                    <div className="map-legend__item">
                      <div className="map-legend__dot" style={{ background: '#4CAF50' }} />
                      Active
                    </div>
                    <div className="map-legend__item">
                      <div className="map-legend__dot" style={{ background: '#f44336' }} />
                      Inactive
                    </div>
                  </div>
                </div>
                {/* Fullscreen map body */}
                <div className="map-fullscreen-body">
                  <MapView buses={buses} />
                </div>
              </div>
            </div>
          )}

        </div>
        {/* ══════════════ END LEFT ══════════════ */}

        {/* ══════════════ RIGHT (40%) — Bus List + Bus Details ══════════════ */}
        <div className="dash-right">
          <BusList buses={buses} selectedId={selectedId} onSelect={handleSelect} />
          <BusInfoCard bus={selectedBus} onTrackLocation={handleTrackLocation} />
        </div>
        {/* ══════════════ END RIGHT ══════════════ */}

      </div>

      {/* ── Track Location full-screen overlay ── */}
      {isTracking && selectedBus && (
        <TrackLocationView
          bus={selectedBus}
          buses={buses}
          onClose={handleCloseTracking}
          authToken={authToken}
        />
      )}
    </div>
  );
}

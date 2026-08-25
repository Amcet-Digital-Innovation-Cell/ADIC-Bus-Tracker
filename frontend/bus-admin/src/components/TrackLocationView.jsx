/* ─────────────────────────────────────────────────────────
   TrackLocationView — Full-screen map overlay focused on a
   single selected bus.

   Changes in this version:
     - On mount, actively fetches latest GPS from
       GET /api/gps/location/:vehicleNumber
       to get the most current Supabase gps_telemetry data.
     - Falls back to bus.latitude/longitude if API unavailable
     - Falls back to grid position only when GPS is null
     - Shows actual lat/lng, speed, ignition, and location
       in the info panel (or "Pending GPS" if no data)
     - Polls every 60s while the panel is open

   Props:
     bus      — the selected bus object (required)
     buses    — full bus array (needed to derive position by index)
     onClose  — callback to return to the dashboard
     authToken — Supabase JWT (forwarded to backend)
─────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { X, Navigation, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import L from 'leaflet';

const API_BASE = import.meta.env.VITE_API_URL || 'https://bustransit-g4ks.onrender.com';

// Fallback base (Vellore, Tamil Nadu)
const BASE_LAT = 12.9165;
const BASE_LNG = 79.1325;

function getGridPosition(index) {
  const cols = 5;
  const row = Math.floor(index / cols);
  const col = index % cols;
  return {
    lat: BASE_LAT + (row - 1) * 0.018,
    lng: BASE_LNG + (col - 2) * 0.022,
  };
}

/**
 * Resolves real GPS or grid fallback position for a bus.
 */
function getBusPosition(lat, lng, index) {
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  if (!isNaN(parsedLat) && !isNaN(parsedLng) && parsedLat !== 0 && parsedLng !== 0) {
    return { lat: parsedLat, lng: parsedLng, isReal: true };
  }
  return { ...getGridPosition(index), isReal: false };
}

const getMarkerColor = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'active') return '#4CAF50';
  return '#f44336';
};

/** Focused marker icon with pulsing ring */
const createFocusedIcon = (color, busLabel) => {
  const safeLabel = String(busLabel || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return L.divIcon({
    html: `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
        width: max-content;
        position: relative;
      ">
        <!-- Pulse ring -->
        <div style="
          position: absolute;
          top: -8px; left: -8px;
          width: 46px; height: 46px;
          border-radius: 50%;
          background: ${color}33;
          animation: trackPulse 1.8s ease-out infinite;
          z-index: -1;
        "></div>
        <!-- Bus circle -->
        <div style="
          background-color: ${color};
          width: 30px; height: 30px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: white; font-size: 14px;
          border: 3px solid white;
          box-shadow: 0 0 0 3px ${color}88, 0 4px 12px rgba(0,0,0,0.35);
          flex-shrink: 0;
        ">&#x1F68C;</div>
        <!-- Label pill -->
        <div style="
          margin-top: 5px;
          background: #ffffff;
          border: 1.5px solid #d1d5db;
          border-radius: 999px;
          padding: 3px 10px;
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
          font-size: 11px; font-weight: 700; color: #1a202c;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          pointer-events: none;
        ">${safeLabel}</div>
      </div>
    `,
    iconSize: [140, 60],
    iconAnchor: [15, 15],
    className: 'custom-bus-marker-focused',
  });
};

/**
 * MapFocuser — smart map controller for live bus tracking.
 *
 * Behaviour:
 *   1. On first load  → flyTo the bus at zoom 15.
 *   2. User zooms / pans manually → mark as "user interacted".
 *   3. On GPS update (coords change):
 *        - If user HAS interacted: only pan IF the bus has moved
 *          outside the current visible bounds. Zoom is NEVER changed.
 *        - If user has NOT interacted: smooth panTo to follow the bus.
 *
 * isProgrammatic ref prevents our own flyTo / panTo calls
 * from being mis-counted as "user interactions".
 */
function MapFocuser({ lat, lng, trigger }) {
  const map = useMap();
  const prevRef        = useRef({ lat: null, lng: null });
  const hasInitialized = useRef(false);
  const userInteracted = useRef(false);
  const isProgrammatic = useRef(false);

  // ── Listen for user zoom / drag ─────────────────────────────────
  useEffect(() => {
    const markInteracted = () => {
      if (!isProgrammatic.current) {
        userInteracted.current = true;
      }
    };
    map.on('zoomstart', markInteracted);
    map.on('dragstart', markInteracted);
    return () => {
      map.off('zoomstart', markInteracted);
      map.off('dragstart', markInteracted);
    };
  }, [map]);

  // ── React to coordinate changes ─────────────────────────────────
  useEffect(() => {
    const coordsChanged =
      prevRef.current.lat !== lat || prevRef.current.lng !== lng;
    if (!coordsChanged) return;

    const doFly = (zoom) => {
      isProgrammatic.current = true;
      map.flyTo([lat, lng], zoom, { duration: 1.2 });
      // Release flag after animation completes
      setTimeout(() => { isProgrammatic.current = false; }, 1500);
    };

    const doPan = () => {
      isProgrammatic.current = true;
      map.panTo([lat, lng], { animate: true, duration: 0.8 });
      setTimeout(() => { isProgrammatic.current = false; }, 1200);
    };

    if (!hasInitialized.current) {
      // ── First load: zoom to 15 and centre on bus ──────────────
      doFly(15);
      hasInitialized.current = true;
    } else if (userInteracted.current) {
      // ── User has custom zoom: only pan if bus leaves the screen ─
      try {
        if (!map.getBounds().contains([lat, lng])) {
          doPan();
        }
        // If bus is still visible → do nothing, preserve user view
      } catch (_) {
        doPan(); // fallback if bounds check fails
      }
    } else {
      // ── No user interaction yet: follow the bus smoothly ─────
      doPan();
    }

    prevRef.current = { lat, lng };
  }, [map, lat, lng, trigger]);

  return null;
}

const STATUS_STYLES = {
  active: { bg: '#f0fff4', color: '#2d9e5f', border: '#c6f6d5' },
  inactive: { bg: '#fff5f5', color: '#c53030', border: '#fed7d7' },
  maintenance: { bg: '#fffaf0', color: '#c05621', border: '#feebc8' },
};

function getStatusStyle(status = '') {
  return STATUS_STYLES[(status || '').toLowerCase()] || STATUS_STYLES.inactive;
}

export default function TrackLocationView({ bus, buses = [], onClose, authToken }) {
  if (!bus) return null;

  const busIndex = buses.findIndex((b) => b.id === bus.id);

  // Live GPS state fetched from backend
  const [gpsData, setGpsData] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  // The vehicle number to query — from registration_number or busNo
  const vehicleNumber = bus.registration_number || bus.busNo || null;

  /**
   * Fetch latest GPS location from backend /api/gps/location/:vehicleNumber
   * This queries the gps_telemetry table (NOT SkyNav directly).
   */
  const fetchGpsLocation = useCallback(async () => {
    if (!vehicleNumber) return;

    setFetching(true);
    setFetchError(null);

    try {
      const headers = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(
        `${API_BASE}/api/gps/location/${encodeURIComponent(vehicleNumber)}`,
        { headers }
      );

      const json = await res.json();

      if (res.ok && json.success) {
        setGpsData(json);
        setLastFetched(new Date());
        setFetchError(null);
      } else if (res.status === 404) {
        // Vehicle not in gps_telemetry yet — GPS hasn't synced this vehicle
        setGpsData(null);
        setFetchError('No GPS data yet. Waiting for next sync…');
      } else {
        setFetchError(json.message || 'Failed to fetch GPS location');
      }
    } catch (err) {
      setFetchError(`Network error: ${err.message}`);
    } finally {
      setFetching(false);
    }
  }, [vehicleNumber, authToken]);

  // Fetch immediately on mount, then every 60s
  useEffect(() => {
    fetchGpsLocation();
    const timer = setInterval(fetchGpsLocation, 60000);
    return () => clearInterval(timer);
  }, [fetchGpsLocation]);

  // Derive display coordinates: API > bus.latitude/longitude > grid
  const displayLat = gpsData?.latitude ?? bus.latitude;
  const displayLng = gpsData?.longitude ?? bus.longitude;
  const position = getBusPosition(displayLat, displayLng, busIndex >= 0 ? busIndex : 0);
  const displayStatus = gpsData?.status ?? bus.status;
  const color = getMarkerColor(displayStatus);
  const statusStyle = getStatusStyle(displayStatus);

  const busLabel = bus.bus_number
    ? `Bus ${String(bus.bus_number).padStart(2, '0')}`
    : bus.busId
      ? `Bus ${String(bus.busId).padStart(2, '0')}`
      : bus.registration_number || bus.busNo || bus.route_name || bus.route || 'Bus';

  return (
    <div className="track-overlay">
      <style>{`
        @keyframes trackPulse {
          0%   { transform: scale(0.9); opacity: 0.7; }
          70%  { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .custom-bus-marker-focused {
          background: transparent !important;
          border: none !important;
          overflow: visible !important;
        }
        .gps-fetch-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          padding: 2px 7px;
          border-radius: 999px;
          font-weight: 600;
          letter-spacing: 0.01em;
        }
        .gps-fetch-badge.live  { background: #e8f5e9; color: #388e3c; }
        .gps-fetch-badge.error { background: #fff3e0; color: #e65100; }
        .gps-refresh-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #718096;
          display: flex;
          align-items: center;
          padding: 2px;
          border-radius: 4px;
          transition: color 0.2s;
        }
        .gps-refresh-btn:hover { color: #3498db; }
        .gps-refresh-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>

      <div className="track-inner" onClick={(e) => e.stopPropagation()}>

        {/* Top header strip */}
        <div className="track-header">
          <div className="track-header__left">
            <div className="track-header__title">
              <div className="track-header__icon">
                <Navigation size={14} color="#ffffff" strokeWidth={2} />
              </div>
              <h2>Tracking &#8212; {busLabel}</h2>
            </div>
          </div>

          <span
            className="track-status-badge"
            style={{
              background: statusStyle.bg,
              color: statusStyle.color,
              border: `1px solid ${statusStyle.border}`,
            }}
          >
            {(displayStatus || 'Unknown').toUpperCase()}
          </span>

          <button className="track-close-btn" onClick={onClose} title="Close">
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Map + side info layout */}
        <div className="track-body">

          {/* Leaflet map */}
          <div className="track-map-area">
            <MapContainer
              center={[position.lat, position.lng]}
              zoom={13}
              style={{ width: '100%', height: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <MapFocuser
                lat={position.lat}
                lng={position.lng}
                trigger={gpsData?.receivedAt}
              />
              <Marker
                position={[position.lat, position.lng]}
                icon={createFocusedIcon(color, busLabel)}
              />
            </MapContainer>
          </div>

          {/* Side info panel */}
          <div className="track-info-panel">

            {/* Bus avatar + number */}
            <div className="track-info__hero">
              <div className="track-info__avatar" style={{ background: color }}>
                &#x1F68C;
              </div>
              <div>
                <div className="track-info__buslabel">{busLabel}</div>
                <div className="track-info__subroute">{bus.route_name || bus.route || '&#8212;'}</div>
              </div>
            </div>

            {/* Bus metadata rows */}
            <div className="track-info__rows">
              {[
                { label: 'Bus ID', value: bus.bus_number || bus.busId },
                { label: 'Reg Number', value: bus.registration_number || bus.busNo },
                { label: 'Route', value: bus.route_name || bus.route },
                { label: 'Driver', value: bus.driver_name || bus.driver },
                { label: 'Contact', value: bus.driver_phone || bus.contact },
                { label: 'License', value: bus.license_number || bus.license },

              ].map(({ label, value }) => (
                <div className="track-info__row" key={label}>
                  <span className="track-info__label">{label}</span>
                  <span className="track-info__value">{value || '—'}</span>
                </div>
              ))}
            </div>

            {/* GPS Coordinates panel */}
            <div className="track-info__coords">
              <div className="track-info__coords-header">
                <Navigation size={11} strokeWidth={2} />
                GPS Data
                {/* Live / Error badge */}
                {gpsData && !fetchError && (
                  <span className="gps-fetch-badge live" style={{ marginLeft: 'auto' }}>
                    <Wifi size={9} /> LIVE
                  </span>
                )}
                {fetchError && (
                  <span className="gps-fetch-badge error" style={{ marginLeft: 'auto' }}>
                    <WifiOff size={9} /> NO GPS
                  </span>
                )}
                {/* Manual refresh */}
                <button
                  className="gps-refresh-btn"
                  onClick={fetchGpsLocation}
                  disabled={fetching}
                  title="Refresh GPS"
                  style={{ marginLeft: gpsData || fetchError ? '4px' : 'auto' }}
                >
                  <RefreshCw
                    size={12}
                    strokeWidth={2.5}
                    style={{ animation: fetching ? 'spin 1s linear infinite' : 'none' }}
                  />
                </button>
              </div>

              <div className="track-info__coords-body">
                {position.isReal ? (
                  <>
                    <span>Lat: <strong>{position.lat.toFixed(6)}</strong></span>
                    <span>Lng: <strong>{position.lng.toFixed(6)}</strong></span>
                    {gpsData?.speed != null && (
                      <span>Speed: <strong>{gpsData.speed} km/h</strong></span>
                    )}
                    {gpsData?.ignition && (
                      <span>Ignition: <strong>{gpsData.ignition}</strong></span>
                    )}
                    {gpsData?.location && (
                      <span style={{ gridColumn: '1/-1', fontSize: '10px', color: '#718096' }}>
                        {gpsData.location}
                      </span>
                    )}
                    {lastFetched && (
                      <span style={{ gridColumn: '1/-1', fontSize: '10px', color: '#a0aec0' }}>
                        Updated: {lastFetched.toLocaleTimeString()}
                      </span>
                    )}
                  </>
                ) : fetchError ? (
                  <span style={{ color: '#e28743', fontStyle: 'italic', gridColumn: '1/-1' }}>
                    {fetchError}
                  </span>
                ) : (
                  <span style={{ color: '#e28743', fontStyle: 'italic' }}>
                    {fetching ? 'Fetching GPS…' : 'Pending GPS signal'}
                  </span>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

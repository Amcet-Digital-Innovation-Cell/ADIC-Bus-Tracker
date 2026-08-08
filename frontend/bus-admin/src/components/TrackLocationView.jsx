/* ─────────────────────────────────────────────────────────
   TrackLocationView — Full-screen map overlay focused on a
   single selected bus.

   Changes from v1:
     - Uses REAL GPS coordinates (bus.latitude / bus.longitude)
     - Falls back to grid position only when GPS is null
     - Shows actual lat/lng in the info panel (or "Pending GPS")

   Props:
     bus      — the selected bus object (required)
     buses    — full bus array (needed to derive position by index)
     onClose  — callback to return to the dashboard
─────────────────────────────────────────────────────────── */
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { X, Navigation } from 'lucide-react';
import L from 'leaflet';

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
function getBusPosition(bus, index) {
  const lat = parseFloat(bus.latitude);
  const lng = parseFloat(bus.longitude);
  if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
    return { lat, lng, isReal: true };
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

/** Centers + zooms the map to the bus position on mount */
function MapFocuser({ lat, lng }) {
  const map = useMap();
  const didFly = useRef(false);
  useEffect(() => {
    if (!didFly.current) {
      map.flyTo([lat, lng], 15, { duration: 1.2 });
      didFly.current = true;
    }
  }, [map, lat, lng]);
  return null;
}

const STATUS_STYLES = {
  active:      { bg: '#f0fff4', color: '#2d9e5f', border: '#c6f6d5' },
  inactive:    { bg: '#fff5f5', color: '#c53030', border: '#fed7d7' },
  maintenance: { bg: '#fffaf0', color: '#c05621', border: '#feebc8' },
};

function getStatusStyle(status = '') {
  return STATUS_STYLES[(status || '').toLowerCase()] || STATUS_STYLES.inactive;
}

export default function TrackLocationView({ bus, buses = [], onClose }) {
  if (!bus) return null;

  const busIndex    = buses.findIndex((b) => b.id === bus.id);
  const position    = getBusPosition(bus, busIndex >= 0 ? busIndex : 0);
  const color       = getMarkerColor(bus.status);
  const statusStyle = getStatusStyle(bus.status);

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
            {(bus.status || 'Unknown').toUpperCase()}
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
              <MapFocuser lat={position.lat} lng={position.lng} />
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

            {/* Info rows */}
            <div className="track-info__rows">
              {[
                { label: 'Bus ID',     value: bus.bus_number || bus.busId },
                { label: 'Reg Number', value: bus.registration_number || bus.busNo },
                { label: 'Route',      value: bus.route_name || bus.route },
                { label: 'Driver',     value: bus.driver_name || bus.driver },
                { label: 'Contact',    value: bus.driver_phone || bus.contact },
                { label: 'License',    value: bus.license_number || bus.license },
                { label: 'Capacity',   value: bus.capacity ? `${bus.capacity} seats` : '—' },
              ].map(({ label, value }) => (
                <div className="track-info__row" key={label}>
                  <span className="track-info__label">{label}</span>
                  <span className="track-info__value">{value || '—'}</span>
                </div>
              ))}
            </div>

            {/* GPS Coordinates */}
            <div className="track-info__coords">
              <div className="track-info__coords-header">
                <Navigation size={11} strokeWidth={2} />
                GPS Coordinates
              </div>
              <div className="track-info__coords-body">
                {position.isReal ? (
                  <>
                    <span>Lat: <strong>{position.lat.toFixed(6)}</strong></span>
                    <span>Lng: <strong>{position.lng.toFixed(6)}</strong></span>
                  </>
                ) : (
                  <span style={{ color: '#e28743', fontStyle: 'italic' }}>
                    Pending GPS signal
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

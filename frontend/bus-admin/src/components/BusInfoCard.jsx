/* ─────────────────────────────────────────────────────────
   BusInfoCard — "Bus Details" card below the Bus List
   Shows: Bus ID · Bus Number · Route · Driver Name ·
          Driver Contact · License Number · Capacity
───────────────────────────────────────────────────────── */
import { Bus, MapPin, Wifi, WifiOff } from 'lucide-react';

const GPS_STATUS_CONFIG = {
  Online:  { color: '#2d9e5f', bg: '#f0fff4', icon: Wifi },
  Pending: { color: '#e28743', bg: '#fffaf0', icon: WifiOff },
};

function InfoRow({ label, value }) {
  return (
    <div className="bus-info__row">
      <span className="bus-info__label">{label}</span>
      <span className="bus-info__value">{value}</span>
    </div>
  );
}

function GpsStatusBadge({ status }) {
  const cfg = GPS_STATUS_CONFIG[status] ?? GPS_STATUS_CONFIG.Pending;
  const Icon = cfg.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 10px', borderRadius: '12px',
      fontSize: '12px', fontWeight: 600,
      color: cfg.color, background: cfg.bg,
    }}>
      <Icon size={12} strokeWidth={2.5} />
      {status}
    </span>
  );
}

export default function BusInfoCard({ bus, onTrackLocation }) {
  const busIdDisplay = bus ? (bus.busId || (bus.route && /^\d+-/.test(bus.route) ? bus.route.split('-')[0] : null) || (bus.id && String(bus.id).length < 5 ? bus.id : bus.busNo)) : null;

  return (
    <div className="bus-info-card">
      {/* Card header */}
      <div className="bus-info-card__header">
        <div className="bus-info-card__title">
          <div className="bus-info-card__title-icon">
            <Bus size={15} color="#ffffff" strokeWidth={2} />
          </div>
          <h2>Bus Details</h2>
        </div>
        {bus && (
          <span className="bus-info-card__badge">Bus {busIdDisplay}</span>
        )}
      </div>

      {/* Card body */}
      <div className="bus-info-card__body">
        {bus ? (
          <>
            <div className="bus-info__grid">
              <InfoRow label="Bus ID" value={busIdDisplay} />
              <InfoRow label="Bus Number" value={bus.number || bus.busNo} />
              <InfoRow label="Route" value={bus.route} />
              <div className="bus-info__row">
                <span className="bus-info__label">GPS Status</span>
                <span className="bus-info__value">
                  <GpsStatusBadge status={bus.gpsStatus || 'Pending'} />
                </span>
              </div>
              <InfoRow label="Driver Name" value={bus.driver} />
              <InfoRow label="Driver Contact" value={bus.driverPhone || bus.contact} />
              <InfoRow label="License Number" value={bus.license} />
            </div>

            {/* ── Track Location button ── */}
            <button
              className="track-location-btn"
              onClick={onTrackLocation}
              title="Open full-screen tracking map for this bus"
            >
              <MapPin size={15} strokeWidth={2.5} />
              Track Location
            </button>
          </>
        ) : (
          <div className="bus-info__empty">
            <div className="bus-info__empty-icon">
              <Bus size={28} color="#cbd5e0" strokeWidth={1.5} />
            </div>
            <p className="bus-info__empty-text">
              Select a bus from the Bus List to view its details.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

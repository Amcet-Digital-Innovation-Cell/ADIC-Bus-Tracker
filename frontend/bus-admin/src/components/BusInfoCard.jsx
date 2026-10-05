/* ─────────────────────────────────────────────────────────
   BusInfoCard — "Bus Details" card below the Bus List
   Shows bus details in a 2-column info grid matching the screenshot
───────────────────────────────────────────────────────── */
import { Bus, MapPin } from 'lucide-react';

function InfoItem({ label, value }) {
  return (
    <div className="bus-info__item">
      <span className="bus-info__label">{label}</span>
      <span className="bus-info__value" title={value}>{value || '—'}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const isActive   = status === 'Active' || status === 'active';
  const isInactive = status === 'Inactive' || status === 'inactive';
  const cls = isActive ? 'status-badge status-badge--active'
            : isInactive ? 'status-badge status-badge--inactive'
            : 'status-badge status-badge--pending';
  return <span className={cls}>{status || 'Pending'}</span>;
}

/**
 * StopsItem
 * Renders the "Stops" grid cell.
 * – Shows a compact pill with the stop count.
 * – On hover, a floating tooltip lists every stop name separated by →.
 */
function StopsItem({ stops }) {
  const count = Array.isArray(stops) ? stops.length : 0;

  return (
    <div className="bus-info__item">
      <span className="bus-info__label">Stops</span>
      {count > 0 ? (
        <div className="bus-info__stops-wrap">
          {/* Count pill — the hover target */}
          <span className="bus-info__stops-pill">
            {count}&nbsp;{count === 1 ? 'Stop' : 'Stops'}
          </span>

          {/* Tooltip — shown on hover via CSS */}
          <div className="bus-info__stops-tooltip" role="tooltip" aria-label="Stopping pattern">
            <ol className="bus-info__stops-tooltip-list">
              {stops.map((s, i) => (
                <li key={s.id ?? i} className="bus-info__stops-tooltip-item">
                  {s.stop_name}
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : (
        <span className="bus-info__value">—</span>
      )}
    </div>
  );
}

export default function BusInfoCard({ bus, onTrackLocation }) {
  const busIdDisplay = bus
    ? (bus.busId || (bus.route && /^\d+-/.test(bus.route) ? bus.route.split('-')[0] : null) || (bus.id && String(bus.id).length < 5 ? bus.id : bus.busNo))
    : null;

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
              <InfoItem label="Bus ID"         value={busIdDisplay} />
              <InfoItem label="Bus Number"     value={bus.number || bus.busNo} />
              <InfoItem label="Route"          value={bus.route} />
              <div className="bus-info__item">
                <span className="bus-info__label">Status</span>
                <StatusBadge status={bus.status} />
              </div>
              <InfoItem label="Driver Name"    value={bus.driver} />
              <InfoItem label="Driver Contact" value={bus.driverPhone || bus.contact} />
              <InfoItem label="License Number" value={bus.license} />
              <StopsItem stops={bus.stops} />
            </div>

            {/* Track Location button */}
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

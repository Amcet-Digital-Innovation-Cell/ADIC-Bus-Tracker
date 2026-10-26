import { useState, useMemo } from 'react';
import {
  X,
  MapPin,
  Route as RouteIcon,
  Search,
  Flag,
  ArrowRight,
  Bus,
  CheckCircle2,
} from 'lucide-react';
import './ViewStopsModal.css';

/**
 * ViewStopsModal
 * ─────────────────────────────────────────────────────────────
 * Clean, modern Card-style modal displaying the ordered sequence of stops
 * and route information clearly.
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: function
 *  - routeName: string
 *  - busNumber: string (optional)
 *  - origin: string (optional)
 *  - destination: string (optional)
 *  - stops: Array of (string | { id, stop_name, name, stop_order, latitude, longitude })
 */
export default function ViewStopsModal({
  isOpen,
  onClose,
  routeName = '',
  busNumber = '',
  origin = '',
  destination = '',
  stops = [],
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Normalize and sort stops into a uniform array of objects with 1-based order
  const normalizedStops = useMemo(() => {
    if (!Array.isArray(stops) || stops.length === 0) return [];

    const sorted = [...stops].sort((a, b) => {
      const orderA = a && typeof a === 'object' && a.stop_order !== undefined ? Number(a.stop_order) : 0;
      const orderB = b && typeof b === 'object' && b.stop_order !== undefined ? Number(b.stop_order) : 0;
      return orderA - orderB;
    });

    return sorted
      .map((item, index) => {
        if (!item) return null;
        const name = typeof item === 'string' ? item.trim() : (item.stop_name || item.name || '').trim();
        if (!name) return null;
        return {
          id: item.id || `stop-${index + 1}`,
          index: index + 1,
          name,
          lat: item.latitude || item.lat || null,
          lng: item.longitude || item.lng || null,
        };
      })
      .filter(Boolean);
  }, [stops]);

  // Filtered stops based on search query
  const filteredStops = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return normalizedStops;
    return normalizedStops.filter((s) => s.name.toLowerCase().includes(q));
  }, [normalizedStops, searchQuery]);

  if (!isOpen) return null;

  const totalCount = normalizedStops.length;
  const displayOrigin = origin || normalizedStops[0]?.name || 'Origin';
  const displayDest = destination || (totalCount > 1 ? normalizedStops[totalCount - 1]?.name : '') || 'AMCET';

  return (
    <div className="view-stops-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="view-stops-panel" onClick={(e) => e.stopPropagation()}>
        {/* ── Modal Header ─────────────────────────────────── */}
        <div className="view-stops-header">
          <div className="view-stops-header__top">
            <div className="view-stops-badge-group">
              <span className="view-stops-type-pill">
                <RouteIcon size={13} />
                Route Stops Sequence
              </span>
              {busNumber && (
                <span className="view-stops-bus-pill">
                  <Bus size={13} />
                  {busNumber}
                </span>
              )}
              <span className="view-stops-count-pill">
                {totalCount} {totalCount === 1 ? 'Stop' : 'Stops'}
              </span>
            </div>

            <button
              type="button"
              className="view-stops-close-btn"
              onClick={onClose}
              aria-label="Close stops modal"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>

          <h2 className="view-stops-title">
            {routeName || 'Route Stops Directory'}
          </h2>

          {(displayOrigin || displayDest || totalCount > 0) && (
            <div className="view-stops-path-preview">
              <span className="path-node path-node--origin">
                <MapPin size={13} />
                <strong>{displayOrigin}</strong>
              </span>
              <ArrowRight size={14} className="path-arrow" />
              <span className="path-node path-node--dest">
                <Flag size={13} />
                <strong>{displayDest}</strong>
              </span>
            </div>
          )}
        </div>

        {/* ── Search Bar (if > 4 stops) ─────────────────────── */}
        {totalCount > 4 && (
          <div className="view-stops-search-bar">
            <Search size={15} className="view-stops-search-icon" />
            <input
              type="text"
              placeholder="Search stop in sequence..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="view-stops-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="view-stops-search-clear"
                onClick={() => setSearchQuery('')}
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {/* ── Stops Timeline List ──────────────────────────── */}
        <div className="view-stops-body">
          {totalCount === 0 ? (
            <div className="view-stops-empty">
              <RouteIcon size={38} className="view-stops-empty-icon" />
              <h4>No Stops Assigned</h4>
              <p>This route does not have any stops assigned yet.</p>
            </div>
          ) : filteredStops.length === 0 ? (
            <div className="view-stops-empty">
              <Search size={32} className="view-stops-empty-icon" />
              <h4>No Matching Stops</h4>
              <p>No stops matched "{searchQuery}".</p>
            </div>
          ) : (
            <div className="view-stops-timeline">
              {filteredStops.map((stop) => {
                const isFirst = stop.index === 1;
                const isLast = stop.index === totalCount && totalCount > 1;

                let roleLabel = 'Waypoint';
                let roleClass = 'role--waypoint';
                if (isFirst) {
                  roleLabel = 'Origin / Departure';
                  roleClass = 'role--origin';
                } else if (isLast) {
                  roleLabel = 'Final Terminal';
                  roleClass = 'role--dest';
                }

                return (
                  <div key={stop.id} className={`stop-item ${roleClass}`}>
                    {/* Timeline indicator */}
                    <div className="stop-marker-col">
                      <div className="stop-marker-dot">
                        {isFirst ? (
                          <MapPin size={13} />
                        ) : isLast ? (
                          <Flag size={13} />
                        ) : (
                          <span className="dot-inner" />
                        )}
                      </div>
                      {stop.index < totalCount && <div className="stop-connector-line" />}
                    </div>

                    {/* Stop Details Card */}
                    <div className="stop-details-card">
                      <div className="stop-details-header">
                        <span className="stop-seq-badge">
                          Stop {stop.index}
                        </span>
                        <span className={`stop-role-tag ${roleClass}`}>
                          {roleLabel}
                        </span>
                      </div>

                      <div className="stop-name-title">
                        {stop.name}
                      </div>

                      {(stop.lat && stop.lng) && (
                        <div className="stop-geo-meta">
                          <span>{Number(stop.lat).toFixed(4)}° N, {Number(stop.lng).toFixed(4)}° E</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Modal Footer ─────────────────────────────────── */}
        <div className="view-stops-footer">
          <div className="view-stops-footer-summary">
            <CheckCircle2 size={15} color="#10b981" />
            <span>
              {totalCount > 0 ? (
                <>Complete sequence of <strong>{totalCount}</strong> stops</>
              ) : (
                <>Route stop sequence is pending setup</>
              )}
            </span>
          </div>
          <button
            type="button"
            className="btn-view-stops-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

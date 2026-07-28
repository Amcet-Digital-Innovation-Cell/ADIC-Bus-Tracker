/* ─────────────────────────────────────────────────────────
   BusRow — single compact row in the Bus List
   Displays: Bus {busId} ({route}) · Status badge
───────────────────────────────────────────────────────── */

const STATUS_CONFIG = {
  Active: { color: '#2d9e5f', bg: '#f0fff4', label: 'Active' },
  active: { color: '#2d9e5f', bg: '#f0fff4', label: 'Active' },
  Inactive: { color: '#e53e3e', bg: '#fff5f5', label: 'Inactive' },
  inactive: { color: '#e53e3e', bg: '#fff5f5', label: 'Inactive' },
  'Pending (GPS)': { color: '#e28743', bg: '#fffaf0', label: 'Pending (GPS)' },
};

export default function BusRow({ bus, isSelected, onClick }) {
  const cfg = STATUS_CONFIG[bus.status] ?? STATUS_CONFIG.Inactive;
  const busIdDisplay = bus.busId || (bus.route && /^\d+-/.test(bus.route) ? bus.route.split('-')[0] : null) || (bus.id && String(bus.id).length < 5 ? bus.id : bus.busNo);

  return (
    <div
      className={`bus-row${isSelected ? ' bus-row--selected' : ''}`}
      onClick={() => onClick(bus.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(bus.id)}
      aria-pressed={isSelected}
    >
      <span className="bus-row__number">
        Bus {busIdDisplay}
        <span className="bus-row__route"> ({bus.route})</span>
      </span>
      <span
        className="bus-row__status"
        style={{ color: cfg.color, background: cfg.bg }}
      >
        {cfg.label}
      </span>
    </div>
  );
}

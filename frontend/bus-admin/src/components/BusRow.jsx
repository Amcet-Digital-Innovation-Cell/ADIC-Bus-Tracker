/* ─────────────────────────────────────────────────────────
   BusRow — single compact row in the Bus List
   Displays: Bus {busId} ({route}) · Status badge
───────────────────────────────────────────────────────── */

export default function BusRow({ bus, isSelected, onClick }) {
  const isActive   = bus.status === 'Active' || bus.status === 'active';
  const isInactive = bus.status === 'Inactive' || bus.status === 'inactive';

  const badgeCls = isActive
    ? 'bus-row__status status-badge status-badge--active'
    : isInactive
    ? 'bus-row__status status-badge status-badge--inactive'
    : 'bus-row__status status-badge status-badge--pending';

  const badgeLabel = isActive ? 'Active' : isInactive ? 'Inactive' : (bus.status || 'Pending');

  const busIdDisplay = bus.busId
    || (bus.route && /^\d+-/.test(bus.route) ? bus.route.split('-')[0] : null)
    || (bus.id && String(bus.id).length < 5 ? bus.id : bus.busNo);

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
      <span className={badgeCls}>{badgeLabel}</span>
    </div>
  );
}

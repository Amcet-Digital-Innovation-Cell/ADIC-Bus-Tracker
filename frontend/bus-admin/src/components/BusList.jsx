import { Bus } from 'lucide-react';
import BusRow from './BusRow';

/* ─────────────────────────────────────────────────────────
   BusList — "Bus List" card for the right column
   State is lifted: selectedId + onSelect come from parent
───────────────────────────────────────────────────────── */
export default function BusList({ buses = [], selectedId, onSelect }) {
  return (
    <div className="bus-list-card">
      {/* Card header */}
      <div className="bus-list-card__header">
        <div className="bus-list-card__title">
          <div className="bus-list-card__title-icon">
            <Bus size={15} color="#ffffff" strokeWidth={2} />
          </div>
          <h2>Buses List</h2>
        </div>
        <span className="bus-list-card__count">{buses.length} BUSES</span>
      </div>

      {/* Column labels */}
      <div className="bus-list__cols">
        <span>Bus ID &amp; Route</span>
        <span>Status</span>
      </div>

      {/* Scrollable list */}
      <div className="bus-list__body">
        {buses.length > 0 ? (
          buses.map((bus) => (
            <BusRow
              key={bus.id}
              bus={bus}
              isSelected={selectedId === bus.id}
              onClick={onSelect}
            />
          ))
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 16px',
            gap: '8px',
            color: '#a0aec0',
            textAlign: 'center',
          }}>
            <Bus size={32} color="#cbd5e0" strokeWidth={1.5} />
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 500 }}>No buses added yet.</p>
            <p style={{ margin: 0, fontSize: '12px' }}>Go to the <strong>Buses</strong> page to add your first bus.</p>
          </div>
        )}
      </div>
    </div>
  );
}

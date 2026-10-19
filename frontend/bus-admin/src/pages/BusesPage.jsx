import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, X, Search, ChevronDown, ChevronUp } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://bustransit-g4ks.onrender.com';

const getToken = () => sessionStorage.getItem('authToken');

const mapFromDb = (row) => ({
  id: row.id,
  busId: row.bus_number ? String(row.bus_number).toUpperCase() : '',
  busNo: row.registration_number ? String(row.registration_number).replace(/\s+/g, '').toUpperCase() : '',
  driver: row.driver_name ? String(row.driver_name).toUpperCase() : '',
  contact: row.driver_phone ? String(row.driver_phone).toUpperCase() : '',
  route: row.route_name ? String(row.route_name).toUpperCase() : '',
  route_id: row.route_id || '',
  license: row.license_number ? String(row.license_number).toUpperCase() : '',
  status: row.status || 'Pending (GPS)',
  latitude: row.latitude,
  longitude: row.longitude,
  stops: Array.isArray(row.stops)
    ? row.stops.map((s, idx) => ({
        id: s.id || idx,
        stop_name: (s.stop_name || s || '').toUpperCase(),
        stop_order: s.stop_order || idx + 1,
      }))
    : (Array.isArray(row.bus_stops)
        ? row.bus_stops.map((s, idx) => ({
            id: s.id || idx,
            stop_name: (s.stop_name || s || '').toUpperCase(),
            stop_order: s.stop_order || idx + 1,
          }))
        : []),
});

/* ── Status badge component ── */
function StatusBadge({ status }) {
  const isActive   = status === 'Active' || status === 'active';
  const isInactive = status === 'Inactive' || status === 'inactive';
  const cls = isActive
    ? 'status-badge status-badge--active'
    : isInactive
    ? 'status-badge status-badge--inactive'
    : 'status-badge status-badge--pending';
  return <span className={cls}>{status || 'Pending'}</span>;
}

const BusesPage = ({ buses, setBuses }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBus, setEditingBus]   = useState(null);
  const [searchTerm, setSearchTerm]   = useState('');
  const [busToDelete, setBusToDelete] = useState(null);
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [apiError, setApiError]       = useState('');
  const cancelDeleteRef = useRef(null);

  const emptyForm = { route_id: '', route: '', busNo: '', busId: '', driver: '', contact: '', license: '', stops: [] };
  const [formData, setFormData] = useState(emptyForm);

  const [routesList, setRoutesList]     = useState([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError]   = useState('');

  // ── Load routes ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchRoutes = async () => {
      setRoutesLoading(true);
      setRoutesError('');
      try {
        const res = await fetch(`${API_BASE}/api/routes`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error(`Failed to load routes (${res.status})`);
        const json = await res.json();
        const data = json.data || json;
        setRoutesList(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('fetchRoutes:', err.message);
        setRoutesError(err.message || 'Failed to load routes');
      } finally {
        setRoutesLoading(false);
      }
    };
    fetchRoutes();
  }, []);

  // ── Load buses ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchBuses = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/buses`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error(`Failed to load buses (${res.status})`);
        const json = await res.json();
        const data = json.data || json;
        setBuses(Array.isArray(data) ? data.map(mapFromDb) : []);
      } catch (err) {
        console.error('fetchBuses:', err.message);
      }
    };
    fetchBuses();
  }, []);

  const filteredBuses = buses.filter(bus =>
    (bus.busNo   || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (bus.route   || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (bus.driver  || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── Stop Management Handlers ──────────────────────────────────────────────
  const handleAddStop = () => {
    setFormData((prev) => ({
      ...prev,
      stops: [
        ...prev.stops,
        { stop_name: '', stop_order: prev.stops.length + 1 },
      ],
    }));
  };

  const handleRemoveStop = (indexToRemove) => {
    setFormData((prev) => {
      const updated = prev.stops.filter((_, idx) => idx !== indexToRemove);
      const reordered = updated.map((s, idx) => ({
        ...s,
        stop_order: idx + 1,
      }));
      return { ...prev, stops: reordered };
    });
  };

  const handleUpdateStopName = (index, value) => {
    setFormData((prev) => {
      const updated = [...prev.stops];
      updated[index] = {
        ...updated[index],
        stop_name: value.toUpperCase(),
      };
      return { ...prev, stops: updated };
    });
  };

  const handleMoveStop = (index, direction) => {
    setFormData((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.stops.length) return prev;

      const updated = [...prev.stops];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;

      const reordered = updated.map((s, idx) => ({
        ...s,
        stop_order: idx + 1,
      }));
      return { ...prev, stops: reordered };
    });
  };

  // ── Create / Update ──────────────────────────────────────────────────────
  const handleSave = async () => {
    setApiError('');
    if (!formData.route_id) {
      setApiError('Route selection is required');
      return;
    }
    setSaving(true);
    try {
      const stopsPayload = (formData.stops || [])
        .map((s, idx) => ({
          stop_name: (s.stop_name || '').trim().toUpperCase(),
          stop_order: idx + 1,
        }))
        .filter(s => s.stop_name.length > 0);

      if (editingBus) {
        // Step 1: Update bus metadata (exclude stops — handled separately)
        const metaPayload = {
          busNo:    (formData.busNo || '').replace(/\s+/g, '').toUpperCase(),
          driver:   (formData.driver || '').trim().toUpperCase(),
          contact:  (formData.contact || '').trim().toUpperCase(),
          route_id: formData.route_id ? parseInt(formData.route_id, 10) : null,
          license:  (formData.license || '').trim().toUpperCase(),
        };

        const res = await fetch(`${API_BASE}/api/buses/${editingBus.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify(metaPayload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || json.message || 'Update failed');

        // Step 2: Update stops via dedicated endpoint
        const stopsRes = await fetch(`${API_BASE}/api/buses/${editingBus.id}/stops`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ stops: stopsPayload }),
        });
        const stopsJson = await stopsRes.json();
        if (!stopsRes.ok) throw new Error(stopsJson.error || stopsJson.message || 'Failed to save stops');

        // Merge the updated bus data with the fresh stops
        const updatedStops = stopsJson.data || [];
        const updated = mapFromDb({ ...json.data, stops: updatedStops });
        setBuses(buses.map(b => b.id === editingBus.id ? updated : b));
      } else {
        // Create new bus — send everything including stops in one request
        const createPayload = {
          busNo:    (formData.busNo || '').replace(/\s+/g, '').toUpperCase(),
          busId:    (formData.busId || '').trim().toUpperCase(),
          driver:   (formData.driver || '').trim().toUpperCase(),
          contact:  (formData.contact || '').trim().toUpperCase(),
          route_id: formData.route_id ? parseInt(formData.route_id, 10) : null,
          license:  (formData.license || '').trim().toUpperCase(),
          stops:    stopsPayload,
        };

        const res = await fetch(`${API_BASE}/api/buses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify(createPayload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || json.message || 'Create failed');
        const created = mapFromDb(json.data);
        setBuses(prev => [...prev, created]);
      }

      setIsModalOpen(false);
      setEditingBus(null);
      setFormData(emptyForm);
    } catch (err) {
      setApiError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const confirmDelete = (bus) => setBusToDelete(bus);

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/buses/${busToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || json.message || 'Delete failed');
      }
      setBuses(buses.filter(b => b.id !== busToDelete.id));
      setBusToDelete(null);
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => setBusToDelete(null);

  useEffect(() => {
    if (!busToDelete) return;
    const handler = (e) => { if (e.key === 'Escape') handleDeleteCancel(); };
    document.addEventListener('keydown', handler);
    cancelDeleteRef.current?.focus();
    return () => document.removeEventListener('keydown', handler);
  }, [busToDelete]);

  const openAddModal   = () => { setFormData(emptyForm); setEditingBus(null); setApiError(''); setIsModalOpen(true); };
  const openEditModal  = async (bus) => {
    setEditingBus(bus);
    let initialStops = Array.isArray(bus.stops) ? bus.stops : [];
    if (initialStops.length === 0) {
      try {
        const res = await fetch(`${API_BASE}/api/buses/${bus.id}/stops`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (res.ok) {
          const json = await res.json();
          const fetchedStops = json.data || json;
          if (Array.isArray(fetchedStops)) {
            initialStops = fetchedStops;
          }
        }
      } catch (err) {
        console.error('Failed to load bus stops:', err);
      }
    }

    setFormData({
      route_id: bus.route_id || '',
      route: (bus.route || '').toUpperCase(),
      busNo: (bus.busNo || '').replace(/\s+/g, '').toUpperCase(),
      busId: (bus.busId || '').toUpperCase(),
      driver: (bus.driver || '').toUpperCase(),
      contact: (bus.contact || '').toUpperCase(),
      license: (bus.license || '').toUpperCase(),
      stops: initialStops.map((s, idx) => ({
        id: s.id || idx,
        stop_name: (s.stop_name || s || '').toUpperCase(),
        stop_order: s.stop_order || idx + 1,
      })),
    });
    setApiError('');
    setIsModalOpen(true);
  };
  const closeModal     = () => { setIsModalOpen(false); setEditingBus(null); setFormData(emptyForm); setApiError(''); };

  const updateField = (field, value) => {
    let val = value;
    if (typeof val === 'string' && field !== 'route_id') {
      val = field === 'busNo' ? val.replace(/\s+/g, '').toUpperCase() : val.toUpperCase();
    }
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  return (
    <div className="buses-page">

      {/* ── Toolbar ───────────────────────────────── */}
      <div className="buses-toolbar">
        {/* Search bar */}
        <div className="buses-search">
          <Search size={16} className="buses-search__icon" />
          <input
            type="text"
            className="buses-search__input"
            placeholder="Search by bus no, route, or driver..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Add Bus button */}
        <button
          id="add-bus-btn"
          className="btn-orange buses-add-btn"
          onClick={openAddModal}
        >
          <Plus size={17} strokeWidth={2.5} />
          Add Bus
        </button>
      </div>

      {/* ── Table container ───────────────────────── */}
      <div className="buses-table-wrap">
        <div className="buses-table-container">
          <table className="buses-table">
            <thead>
              <tr>
                {['Bus ID', 'Route', 'Bus No', 'Driver', 'Contact', 'License', 'Status', 'Action'].map(col => (
                  <th key={col} className="buses-table__th">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredBuses.length > 0 ? (
                filteredBuses.map((bus) => (
                  <tr key={bus.id} className="buses-table__row">
                    <td className="buses-table__td buses-table__td--id">{bus.busId || '—'}</td>
                    <td className="buses-table__td" title={bus.stops && bus.stops.length > 0 ? `Stops: ${bus.stops.map(s => s.stop_name).join(' → ')}` : bus.route}>
                      <div style={{ fontWeight: 600 }}>{bus.route || '—'}</div>
                      {bus.stops && bus.stops.length > 0 && (
                        <div style={{ fontSize: '10px', color: 'var(--color-blue)', fontWeight: 700, marginTop: '2px' }}>
                          {bus.stops.length} STOPS
                        </div>
                      )}
                    </td>
                    <td className="buses-table__td">{bus.busNo || '—'}</td>
                    <td className="buses-table__td">{bus.driver || '—'}</td>
                    <td className="buses-table__td">{bus.contact || '—'}</td>
                    <td className="buses-table__td">{bus.license || '—'}</td>
                    <td className="buses-table__td">
                      <StatusBadge status={bus.status} />
                    </td>
                    <td className="buses-table__td buses-table__td--actions">
                      <div className="buses-actions">
                        <button
                          className="icon-btn"
                          title="Edit bus"
                          onClick={() => openEditModal(bus)}
                        >
                          <Edit2 size={15} strokeWidth={2} />
                        </button>
                        <button
                          className="icon-btn icon-btn--danger"
                          title="Delete bus"
                          onClick={() => confirmDelete(bus)}
                        >
                          <Trash2 size={15} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="buses-table__empty">
                    {buses.length === 0
                      ? 'No buses have been added yet. Click "Add Bus" to get started.'
                      : 'No buses match your search. Try a different keyword.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add / Edit Modal ──────────────────────── */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-panel buses-modal" onClick={(e) => e.stopPropagation()}>

            {/* Close button */}
            <button className="modal-close-btn" onClick={closeModal} title="Close">
              <X size={14} strokeWidth={2.5} />
            </button>

            {/* Title */}
            <div className="buses-modal__header">
              <h2 className="buses-modal__title">{editingBus ? 'Edit Bus' : 'Add Bus'}</h2>
            </div>

            {/* Form */}
            <div className="buses-modal__body">
              <div className="buses-modal__grid">

                {/* Bus Id */}
                <div className="buses-modal__field">
                  <label className="form-label">Bus Id</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 01"
                    value={formData.busId}
                    onChange={e => !editingBus && updateField('busId', e.target.value)}
                    readOnly={!!editingBus}
                    style={editingBus ? { opacity: 0.6, cursor: 'not-allowed', background: 'var(--color-bg-subtle, #f5f5f5)' } : {}}
                    title={editingBus ? 'Bus ID cannot be changed while editing' : ''}
                  />
                </div>

                {/* Route */}
                <div className="buses-modal__field">
                  <label className="form-label">Route</label>
                  {routesLoading ? (
                    <div className="buses-modal__loading">Loading routes…</div>
                  ) : routesError ? (
                    <div className="buses-modal__routes-error">{routesError}</div>
                  ) : (
                    <div className="buses-modal__select-wrap">
                      <select
                        className="form-select"
                        value={formData.route_id || ''}
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          const matched = routesList.find(r => String(r.id) === String(selectedId));
                          updateField('route_id', selectedId);
                          updateField('route', matched ? matched.routeName : '');
                        }}
                      >
                        <option value="">— Select Route —</option>
                        {routesList.map(r => (
                          <option key={r.id} value={r.id}>{r.routeName}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="buses-modal__select-icon" />
                    </div>
                  )}
                </div>

                {/* Bus No */}
                <div className="buses-modal__field">
                  <label className="form-label">Bus No</label>
                  <input
                    className="form-input"
                    placeholder="e.g. TN33BA1234"
                    value={formData.busNo}
                    onChange={e => updateField('busNo', e.target.value)}
                  />
                </div>

                {/* Driver */}
                <div className="buses-modal__field">
                  <label className="form-label">Driver</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Rajesh"
                    value={formData.driver}
                    onChange={e => updateField('driver', e.target.value)}
                  />
                </div>

                {/* Contact */}
                <div className="buses-modal__field">
                  <label className="form-label">Contact</label>
                  <input
                    className="form-input"
                    placeholder="e.g. +91 9876543210"
                    value={formData.contact}
                    onChange={e => updateField('contact', e.target.value)}
                  />
                </div>

                {/* License */}
                <div className="buses-modal__field">
                  <label className="form-label">License</label>
                  <input
                    className="form-input"
                    placeholder="e.g. AD 32545"
                    value={formData.license}
                    onChange={e => updateField('license', e.target.value)}
                  />
                </div>

              </div>

              {/* ── Bus-Specific Stops Section ── */}
              <div className="buses-modal__stops-header" style={{
                marginTop: '16px',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: '1px solid var(--color-border-soft)',
                paddingTop: '14px',
              }}>
                <label className="form-label" style={{ margin: 0 }}>
                  BUS STOPS (STOPPING PATTERN)
                </label>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-blue-light)',
                  color: 'var(--color-blue-dark)',
                }}>
                  {formData.stops.length} STOPS
                </span>
              </div>

              <div className="buses-modal__stops-list" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '180px',
                overflowY: 'auto',
                paddingRight: '4px',
                marginBottom: '12px',
              }}>
                {formData.stops.map((stop, idx) => (
                  <div key={idx} className="buses-modal__stop-row" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#f7f9fc',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-soft)',
                    boxShadow: 'var(--shadow-inset)',
                  }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--color-text-muted)',
                      minWidth: '22px',
                    }}>
                      {idx + 1}.
                    </span>
                    <input
                      className="form-input"
                      style={{
                        height: '34px',
                        fontSize: '12.5px',
                        padding: '0 10px',
                        flex: 1,
                      }}
                      placeholder={`e.g. STOP ${idx + 1}`}
                      value={stop.stop_name}
                      onChange={(e) => handleUpdateStopName(idx, e.target.value)}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ width: '28px', height: '28px', opacity: idx === 0 ? 0.4 : 1 }}
                        onClick={() => handleMoveStop(idx, 'up')}
                        disabled={idx === 0}
                        title="Move Up"
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ width: '28px', height: '28px', opacity: idx === formData.stops.length - 1 ? 0.4 : 1 }}
                        onClick={() => handleMoveStop(idx, 'down')}
                        disabled={idx === formData.stops.length - 1}
                        title="Move Down"
                      >
                        <ChevronDown size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        style={{ width: '28px', height: '28px' }}
                        onClick={() => handleRemoveStop(idx)}
                        title="Remove Stop"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}

                {formData.stops.length === 0 && (
                  <div style={{
                    textAlign: 'center',
                    fontSize: '12px',
                    color: 'var(--color-text-faint)',
                    padding: '12px 0',
                    background: '#f7fafc',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--color-border)',
                  }}>
                    No bus-specific stops added yet. Click "+ Add Stop" below.
                  </div>
                )}
              </div>

              <button
                type="button"
                className="btn-ghost"
                style={{
                  height: '36px',
                  fontSize: '12.5px',
                  width: '100%',
                  marginBottom: '16px',
                  justifyContent: 'center',
                }}
                onClick={handleAddStop}
              >
                <Plus size={15} /> Add Stop
              </button>

              {/* API error */}
              {apiError && (
                <div className="buses-modal__error">{apiError}</div>
              )}

              {/* Save button */}
              <button
                id="save-bus-btn"
                className="btn-primary buses-modal__save-btn"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────── */}
      {busToDelete && (
        <div
          className="modal-overlay"
          onClick={handleDeleteCancel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-bus-title"
        >
          <div
            className="modal-panel buses-delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button className="modal-close-btn" onClick={handleDeleteCancel} title="Close">
              <X size={14} strokeWidth={2.5} />
            </button>

            {/* Red icon */}
            <div className="buses-delete-modal__icon">
              <Trash2 size={28} color="#ef4444" strokeWidth={2} />
            </div>

            <h2 id="delete-bus-title" className="buses-delete-modal__title">Delete Bus</h2>
            <p className="buses-delete-modal__msg">
              Are you sure you want to delete <strong>Bus {busToDelete.busNo}</strong> ({busToDelete.route})?
              This action cannot be undone.
            </p>

            <div className="buses-delete-modal__actions">
              <button
                ref={cancelDeleteRef}
                className="btn-ghost"
                onClick={handleDeleteCancel}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                <Trash2 size={14} strokeWidth={2} />
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page-scoped styles ────────────────────── */}
      <style>{`
        .buses-page {
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow: hidden;
        }

        /* Toolbar */
        .buses-toolbar {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-shrink: 0;
        }

        .buses-search {
          flex: 1;
          max-width: 440px;
          position: relative;
          display: flex;
          align-items: center;
        }

        .buses-search__icon {
          position: absolute;
          left: 13px;
          color: var(--color-text-faint);
          pointer-events: none;
          flex-shrink: 0;
        }

        .buses-search__input {
          width: 100%;
          height: 42px;
          padding: 0 14px 0 40px;
          border-radius: var(--radius-md);
          border: 1.5px solid var(--color-border);
          background: var(--color-card-bg);
          color: var(--color-text-primary);
          font-size: 13.5px;
          font-weight: 500;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          box-shadow: var(--shadow-card);
        }

        .buses-search__input::placeholder { color: var(--color-text-faint); }

        .buses-search__input:hover {
          border-color: #c8d5e0;
        }

        .buses-search__input:focus {
          border-color: var(--color-blue);
          box-shadow: 0 0 0 3px rgba(52,152,219,0.12), var(--shadow-card);
        }

        .buses-add-btn {
          flex-shrink: 0;
          white-space: nowrap;
        }

        /* Table wrapper */
        .buses-table-wrap {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }

        .buses-table-container {
          background: var(--color-card-bg);
          border-radius: var(--radius-lg);
          border: 1px solid var(--color-border);
          box-shadow: var(--shadow-card);
          overflow: hidden;
        }

        .buses-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .buses-table__th {
          padding: 12px 14px;
          text-align: center;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--color-text-faint);
          background: #f7f9fc;
          border-bottom: 1px solid var(--color-border-soft);
          white-space: nowrap;
        }

        .buses-table__row {
          transition: background var(--transition-fast);
        }

        .buses-table__row:hover { background: #f7fafc; }

        .buses-table__row:not(:last-child) td {
          border-bottom: 1px solid var(--color-border-soft);
        }

        .buses-table__td {
          padding: 13px 14px;
          text-align: center;
          font-size: 13px;
          font-weight: 500;
          color: var(--color-text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          vertical-align: middle;
        }

        .buses-table__td--id {
          font-weight: 700;
          color: var(--color-blue);
        }

        .buses-table__td--actions { overflow: visible; }

        .buses-actions {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .buses-actions .icon-btn {
          width: 30px;
          height: 30px;
          border-radius: var(--radius-sm);
        }

        .buses-table__empty {
          padding: 48px 16px;
          text-align: center;
          color: var(--color-text-faint);
          font-size: 13.5px;
          font-weight: 500;
        }

        /* Modal */
        .buses-modal {
          max-width: 500px;
          padding: 0;
          overflow: hidden;
        }

        .buses-modal__header {
          padding: 22px 24px 16px;
          border-bottom: 1px solid var(--color-border-soft);
        }

        .buses-modal__title {
          margin: 0;
          font-size: 17px;
          font-weight: 700;
          color: var(--color-text-primary);
          letter-spacing: -0.01em;
        }

        .buses-modal__body {
          padding: 20px 24px 24px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .buses-modal__grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px 16px;
        }

        .buses-modal__field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .buses-modal__loading {
          height: 40px;
          display: flex;
          align-items: center;
          padding: 0 14px;
          font-size: 13px;
          color: var(--color-text-muted);
          border-radius: var(--radius-sm);
          border: 1.5px solid var(--color-border);
          background: #f7f9fc;
        }

        .buses-modal__routes-error {
          height: 40px;
          display: flex;
          align-items: center;
          padding: 0 14px;
          font-size: 12.5px;
          color: #dc2626;
          border-radius: var(--radius-sm);
          border: 1.5px solid #fed7d7;
          background: #fff5f5;
        }

        .buses-modal__select-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .buses-modal__select-icon {
          position: absolute;
          right: 12px;
          color: var(--color-text-faint);
          pointer-events: none;
        }

        .buses-modal__error {
          margin-top: 4px;
          padding: 10px 14px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: var(--radius-sm);
          color: #dc2626;
          font-size: 13px;
          text-align: center;
        }

        .buses-modal__save-btn {
          width: 100%;
          margin-top: 4px;
        }

        /* Delete modal */
        .buses-delete-modal {
          padding: 32px 28px 28px;
          max-width: 380px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .buses-delete-modal__icon {
          width: 60px;
          height: 60px;
          border-radius: var(--radius-full);
          background: #fff5f5;
          border: 2px solid #fed7d7;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 18px;
        }

        .buses-delete-modal__title {
          margin: 0 0 10px;
          font-size: 19px;
          font-weight: 700;
          color: var(--color-text-primary);
          letter-spacing: -0.01em;
        }

        .buses-delete-modal__msg {
          margin: 0 0 24px;
          font-size: 13.5px;
          color: var(--color-text-muted);
          line-height: 1.6;
          max-width: 280px;
        }

        .buses-delete-modal__actions {
          display: flex;
          gap: 12px;
          width: 100%;
        }

        .buses-delete-modal__actions .btn-ghost,
        .buses-delete-modal__actions .btn-danger {
          flex: 1;
        }
      `}</style>
    </div>
  );
};

export default BusesPage;
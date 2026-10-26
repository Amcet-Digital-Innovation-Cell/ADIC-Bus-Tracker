import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, X, Search, ChevronDown, Route as RouteIcon, MapPin, Eye } from 'lucide-react';
import ViewStopsModal from '../components/ViewStopsModal';
import apiClient from '../lib/apiClient';

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
        id: s.id || idx + 1,
        stop_name: (typeof s === 'string' ? s : (s.stop_name || s.name || '')).toUpperCase(),
        stop_order: s.stop_order !== undefined ? Number(s.stop_order) : idx + 1,
      }))
    : [],
});

/* ── Status badge component ── */
function StatusBadge({ status }) {
  const isActive = status === 'Active' || status === 'active';
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
  const [viewStopsData, setViewStopsData] = useState(null);
  const [editingBus, setEditingBus] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [busToDelete, setBusToDelete] = useState(null);
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [apiError, setApiError]       = useState('');
  const cancelDeleteRef = useRef(null);

  const emptyForm = {
    route_id: '',
    route: '',
    busNo: '',
    busId: '',
    driver: '',
    contact: '',
    license: '',
  };
  const [formData, setFormData] = useState(emptyForm);

  const [routesList, setRoutesList]     = useState([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError]   = useState('');

  // ── Load available routes from bus_routes ──────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const fetchRoutes = async () => {
      setRoutesLoading(true);
      setRoutesError('');
      try {
        const json = await apiClient.get('/api/routes');
        if (!isMounted) return;
        const data = json.data || json;
        setRoutesList(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('fetchRoutes error:', err.message);
        if (isMounted) {
          setRoutesError(err.message || 'Failed to load routes');
        }
      } finally {
        if (isMounted) setRoutesLoading(false);
      }
    };
    fetchRoutes();
    return () => {
      isMounted = false;
    };
  }, []);

  // ── Load buses from backend ───────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const fetchBuses = async () => {
      try {
        const json = await apiClient.get('/api/buses');
        if (!isMounted) return;
        const data = json.data || json;
        setBuses(Array.isArray(data) ? data.map(mapFromDb) : []);
      } catch (err) {
        console.error('fetchBuses error:', err.message);
      }
    };
    fetchBuses();
    return () => {
      isMounted = false;
    };
  }, [setBuses]);

  const filteredBuses = buses.filter(
    (bus) =>
      (bus.busNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (bus.busId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (bus.route || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (bus.driver || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Selected route object from routesList for preview in modal
  const selectedRouteObj = routesList.find(
    (r) => String(r.id) === String(formData.route_id)
  );

  // ── Save Bus (Create / Update) ─────────────────────────────────────────────
  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setApiError('');

    if (!formData.route_id) {
      setApiError('Please select a route for this bus');
      return;
    }

    const cleanBusNo = (formData.busNo || '').replace(/\s+/g, '').toUpperCase();
    if (!cleanBusNo) {
      setApiError('Bus registration number (Bus No) is required');
      return;
    }

    const cleanBusId = (formData.busId || '').trim().toUpperCase();
    if (!cleanBusId) {
      setApiError('Bus ID is required');
      return;
    }

    setSaving(true);
    try {
      if (editingBus) {
        const metaPayload = {
          busId: cleanBusId,
          busNo: cleanBusNo,
          driver: (formData.driver || '').trim().toUpperCase(),
          contact: (formData.contact || '').trim().toUpperCase(),
          route_id: parseInt(formData.route_id, 10),
          license: (formData.license || '').trim().toUpperCase(),
        };

        const json = await apiClient.put(`/api/buses/${editingBus.id}`, metaPayload);
        const updated = mapFromDb(json.data || json);
        setBuses((prev) =>
          prev.map((b) => (b.id === editingBus.id ? updated : b))
        );
      } else {
        const createPayload = {
          busId: (formData.busId || '').trim().toUpperCase(),
          busNo: cleanBusNo,
          driver: (formData.driver || '').trim().toUpperCase(),
          contact: (formData.contact || '').trim().toUpperCase(),
          route_id: parseInt(formData.route_id, 10),
          license: (formData.license || '').trim().toUpperCase(),
        };

        const json = await apiClient.post('/api/buses', createPayload);
        const created = mapFromDb(json.data || json);
        setBuses((prev) => [...prev, created]);
      }

      setIsModalOpen(false);
      setEditingBus(null);
      setFormData(emptyForm);
    } catch (err) {
      console.error('handleSave error:', err.message);
      setApiError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete Bus ─────────────────────────────────────────────────────────────
  const confirmDelete = (bus) => setBusToDelete(bus);

  const handleDeleteConfirm = async () => {
    if (!busToDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/buses/${busToDelete.id}`);
      setBuses((prev) => prev.filter((b) => b.id !== busToDelete.id));
      setBusToDelete(null);
    } catch (err) {
      console.error('handleDelete error:', err.message);
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => setBusToDelete(null);

  useEffect(() => {
    if (!busToDelete) return;
    const handler = (e) => {
      if (e.key === 'Escape') handleDeleteCancel();
    };
    document.addEventListener('keydown', handler);
    cancelDeleteRef.current?.focus();
    return () => document.removeEventListener('keydown', handler);
  }, [busToDelete]);

  // ── Modal Open / Close Handlers ────────────────────────────────────────────
  const openAddModal = () => {
    setFormData(emptyForm);
    setEditingBus(null);
    setApiError('');
    setIsModalOpen(true);
  };

  const openEditModal = (bus) => {
    setEditingBus(bus);
    setFormData({
      route_id: bus.route_id ? String(bus.route_id) : '',
      route: (bus.route || '').toUpperCase(),
      busNo: (bus.busNo || '').replace(/\s+/g, '').toUpperCase(),
      busId: (bus.busId || '').toUpperCase(),
      driver: (bus.driver || '').toUpperCase(),
      contact: (bus.contact || '').toUpperCase(),
      license: (bus.license || '').toUpperCase(),
    });
    setApiError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBus(null);
    setFormData(emptyForm);
    setApiError('');
  };

  const updateField = (field, value) => {
    let val = value;
    if (typeof val === 'string' && field !== 'route_id') {
      val = field === 'busNo' ? val.replace(/\s+/g, '').toUpperCase() : val.toUpperCase();
    }
    setFormData((prev) => ({ ...prev, [field]: val }));
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
            placeholder="Search by bus no, ID, route, or driver..."
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
                <th className="buses-table__th" style={{ width: '7%' }}>Bus ID</th>
                <th className="buses-table__th" style={{ width: '21%' }}>Assigned Route & Stops</th>
                <th className="buses-table__th" style={{ width: '11%' }}>Bus No</th>
                <th className="buses-table__th" style={{ width: '12%' }}>Driver</th>
                <th className="buses-table__th" style={{ width: '12%' }}>Contact</th>
                <th className="buses-table__th" style={{ width: '11%' }}>License</th>
                <th className="buses-table__th" style={{ width: '12%' }}>Status</th>
                <th className="buses-table__th" style={{ width: '14%' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredBuses.length > 0 ? (
                filteredBuses.map((bus) => {
                  const stopNames = (bus.stops || [])
                    .map((s) => (typeof s === 'string' ? s : s.stop_name || ''))
                    .filter(Boolean);

                  return (
                    <tr key={bus.id} className="buses-table__row">
                      {/* Bus ID */}
                      <td className="buses-table__td buses-table__td--id">
                        {bus.busId ? `Bus ${bus.busId}` : '—'}
                      </td>

                      {/* Route & Stops Sequence */}
                      <td className="buses-table__td" title={stopNames.length > 0 ? `Stops: ${stopNames.join(' → ')}` : (bus.route || 'No route')}>
                        <div className="bus-route-cell">
                          <div className="bus-route-name">
                            <RouteIcon size={13} className="bus-route-icon" />
                            <span>{bus.route || '—'}</span>
                          </div>
                          {stopNames.length > 0 ? (
                            <div className="bus-stops-preview">
                              <span className="bus-stops-badge">
                                {stopNames.length} {stopNames.length === 1 ? 'STOP' : 'STOPS'}
                              </span>
                              <span className="bus-stops-chain">
                                {stopNames.slice(0, 3).join(' → ')}
                                {stopNames.length > 3 ? ` + ${stopNames.length - 3} more` : ''}
                              </span>
                            </div>
                          ) : (
                            <div className="bus-stops-none">No stops assigned</div>
                          )}
                        </div>
                      </td>

                      {/* Bus Registration No */}
                      <td className="buses-table__td font-medium">
                        {bus.busNo || '—'}
                      </td>

                      {/* Driver */}
                      <td className="buses-table__td">{bus.driver || '—'}</td>

                      {/* Contact */}
                      <td className="buses-table__td">{bus.contact || '—'}</td>

                      {/* License */}
                      <td className="buses-table__td">{bus.license || '—'}</td>

                      {/* Status */}
                      <td className="buses-table__td">
                        <StatusBadge status={bus.status} />
                      </td>

                      {/* Actions */}
                      <td className="buses-table__td buses-table__td--actions">
                        <div className="buses-actions">
                          <button
                            className="icon-btn"
                            title="View stops"
                            onClick={() => {
                              const matchedRoute = routesList.find(
                                (r) => (bus.route_id && r.id === bus.route_id) || (bus.route && r.route_name && r.route_name.toLowerCase() === bus.route.toLowerCase())
                              );
                              const stopsToDisplay = (bus.stops && bus.stops.length > 0) ? bus.stops : (matchedRoute?.stops || []);
                              setViewStopsData({
                                routeName: bus.route || matchedRoute?.route_name || (bus.busId ? `Bus ${bus.busId}` : 'Bus Route'),
                                busNumber: bus.busNo ? `Bus ${bus.busId || ''} (${bus.busNo})` : (bus.busId ? `Bus ${bus.busId}` : ''),
                                origin: matchedRoute?.origin || '',
                                destination: matchedRoute?.destination || '',
                                stops: stopsToDisplay,
                              });
                            }}
                          >
                            <Eye size={15} strokeWidth={2} />
                          </button>
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
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className="buses-table__empty">
                    {buses.length === 0
                      ? 'No buses have been added yet. Click "+ Add Bus" to get started.'
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
              <h2 className="buses-modal__title">
                {editingBus ? 'Edit Bus' : 'Add New Bus'}
              </h2>
            </div>

            {/* Form */}
            <form onSubmit={handleSave}>
              <div className="buses-modal__body">
                <div className="buses-modal__grid">
                  {/* Bus ID */}
                  <div className="buses-modal__field">
                    <label className="form-label">Bus ID *</label>
                    <input
                      className="form-input"
                      placeholder="e.g. 01 or 542"
                      value={formData.busId}
                      onChange={(e) => updateField('busId', e.target.value)}
                      required
                    />
                  </div>

                  {/* Route Selection Dropdown */}
                  <div className="buses-modal__field">
                    <label className="form-label">Assigned Route *</label>
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
                            const matched = routesList.find(
                              (r) => String(r.id) === String(selectedId)
                            );
                            updateField('route_id', selectedId);
                            updateField(
                              'route',
                              matched ? matched.route_name || matched.routeName || '' : ''
                            );
                          }}
                          required
                        >
                          <option value="">— Select Route —</option>
                          {routesList.map((r) => {
                            const stopCount = Array.isArray(r.stops) ? r.stops.length : 0;
                            return (
                              <option key={r.id} value={r.id}>
                                {r.route_name || r.routeName} — {stopCount} {stopCount === 1 ? 'stop' : 'stops'}
                              </option>
                            );
                          })}
                        </select>
                        <ChevronDown size={14} className="buses-modal__select-icon" />
                      </div>
                    )}
                  </div>

                  {/* Bus No (Registration Number) */}
                  <div className="buses-modal__field">
                    <label className="form-label">Bus No (Reg. No) *</label>
                    <input
                      className="form-input"
                      placeholder="e.g. TN20CH9640"
                      value={formData.busNo}
                      onChange={(e) => updateField('busNo', e.target.value)}
                      required
                    />
                  </div>

                  {/* Driver */}
                  <div className="buses-modal__field">
                    <label className="form-label">Driver Name</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Rajesh Kumar"
                      value={formData.driver}
                      onChange={(e) => updateField('driver', e.target.value)}
                    />
                  </div>

                  {/* Contact */}
                  <div className="buses-modal__field">
                    <label className="form-label">Driver Contact</label>
                    <input
                      className="form-input"
                      placeholder="e.g. +91 9876543210"
                      value={formData.contact}
                      onChange={(e) => updateField('contact', e.target.value)}
                    />
                  </div>

                  {/* License */}
                  <div className="buses-modal__field">
                    <label className="form-label">License Number</label>
                    <input
                      className="form-input"
                      placeholder="e.g. TN20 201800045"
                      value={formData.license}
                      onChange={(e) => updateField('license', e.target.value)}
                    />
                  </div>
                </div>

                {/* ── Route Stops Info Card (Inherited from selected route) ── */}
                {selectedRouteObj && (
                  <div className="bus-route-info-card">
                    <div className="bus-route-info-card__header">
                      <div className="bus-route-info-card__title">
                        <MapPin size={14} className="text-blue-500" />
                        <span>Stops for &ldquo;{selectedRouteObj.route_name || selectedRouteObj.routeName}&rdquo;</span>
                      </div>
                      <span className="bus-stops-badge">
                        {(selectedRouteObj.stops || []).length} STOPS
                      </span>
                    </div>

                    {selectedRouteObj.stops && selectedRouteObj.stops.length > 0 ? (
                      <div className="bus-route-info-card__stops">
                        {selectedRouteObj.stops.map((s, idx) => {
                          const sName = typeof s === 'string' ? s : s.stop_name || '';
                          return (
                            <span key={idx} className="bus-route-stop-pill">
                              <span className="bus-route-stop-num">{idx + 1}</span>
                              {sName}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="bus-route-info-card__empty">
                        No stops configured for this route. Add stops on the Routes page.
                      </div>
                    )}
                  </div>
                )}

                {/* API error */}
                {apiError && <div className="buses-modal__error">{apiError}</div>}

                {/* Modal Actions */}
                <div className="buses-modal__footer">
                  <button type="button" className="btn-ghost" onClick={closeModal}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="save-bus-btn"
                    className="btn-orange buses-modal__save-btn"
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : editingBus ? 'Update Bus' : 'Add Bus'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── View Stops Modal ──────────────────────── */}
      <ViewStopsModal
        isOpen={Boolean(viewStopsData)}
        onClose={() => setViewStopsData(null)}
        routeName={viewStopsData?.routeName}
        busNumber={viewStopsData?.busNumber}
        origin={viewStopsData?.origin}
        destination={viewStopsData?.destination}
        stops={viewStopsData?.stops}
      />

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

            <h2 id="delete-bus-title" className="buses-delete-modal__title">
              Delete Bus
            </h2>
            <p className="buses-delete-modal__msg">
              Are you sure you want to delete <strong>Bus {busToDelete.busId || busToDelete.busNo}</strong> ({busToDelete.route || 'No Route'})?
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
        .buses-search__input:hover { border-color: #c8d5e0; }
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
          overflow-x: auto;
          overflow-y: hidden;
        }

        .buses-table {
          width: 100%;
          min-width: 960px;
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

        .bus-route-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          max-width: 100%;
        }

        .bus-route-name {
          font-weight: 600;
          color: var(--color-text-primary);
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .bus-route-icon {
          color: var(--color-blue);
          flex-shrink: 0;
        }

        .bus-stops-preview {
          display: flex;
          align-items: center;
          gap: 6px;
          max-width: 100%;
        }

        .bus-stops-badge {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: var(--radius-full);
          background: #e0f2fe;
          color: #0369a1;
          letter-spacing: 0.02em;
          flex-shrink: 0;
        }

        .bus-stops-chain {
          font-size: 11px;
          color: var(--color-text-muted);
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .bus-stops-none {
          font-size: 11px;
          color: var(--color-text-faint);
          font-style: italic;
        }

        .buses-table__td--actions {
          overflow: visible;
          padding: 10px 6px;
        }
        .buses-actions {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex-wrap: nowrap;
        }

        .buses-actions .icon-btn {
          width: 30px;
          height: 30px;
          border-radius: var(--radius-sm);
          flex-shrink: 0;
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
          max-width: 520px;
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
          gap: 16px;
          max-height: 80vh;
          overflow-y: auto;
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

        /* Route Info Card inside Bus Modal */
        .bus-route-info-card {
          background: #f8fafc;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .bus-route-info-card__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .bus-route-info-card__title {
          font-size: 12px;
          font-weight: 600;
          color: var(--color-text-primary);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .bus-route-info-card__stops {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          max-height: 90px;
          overflow-y: auto;
          padding-top: 2px;
        }

        .bus-route-stop-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          padding: 2px 8px;
          border-radius: var(--radius-sm);
          font-size: 11px;
          font-weight: 600;
          color: #334155;
        }

        .bus-route-stop-num {
          font-size: 9.5px;
          font-weight: 700;
          color: var(--color-blue);
          background: #eff6ff;
          width: 15px;
          height: 15px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-full);
        }

        .bus-route-info-card__empty {
          font-size: 11.5px;
          color: var(--color-text-faint);
          font-style: italic;
        }

        .buses-modal__error {
          padding: 10px 14px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: var(--radius-sm);
          color: #dc2626;
          font-size: 13px;
          text-align: center;
        }

        .buses-modal__footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 4px;
        }

        .buses-modal__save-btn {
          min-width: 120px;
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

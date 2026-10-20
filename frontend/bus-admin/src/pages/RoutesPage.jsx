import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Search, MapPin, Navigation, ChevronUp, ChevronDown, ListOrdered } from 'lucide-react';
import apiClient from '../lib/apiClient';

const RoutesPage = () => {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [routeToDelete, setRouteToDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [apiError, setApiError] = useState('');

  const emptyForm = {
    route_code: '',
    route_name: '',
    origin: '',
    destination: '',
    stops: [],
  };

  const [formData, setFormData] = useState(emptyForm);

  // ── Fetch Routes ──────────────────────────────────────────────────────────
  const fetchRoutes = async () => {
    setLoading(true);
    setApiError('');
    try {
      const json = await apiClient.get('/api/routes');
      const data = json.data || json;
      setRoutes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('fetchRoutes error:', err.message);
      setApiError(err.message || 'Failed to load routes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  // ── Filter Routes ─────────────────────────────────────────────────────────
  const filteredRoutes = routes.filter((r) =>
    (r.route_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.route_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.origin || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.destination || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── Dynamic Stop Builder Handlers ─────────────────────────────────────────
  const handleAddStop = () => {
    setFormData((prev) => ({
      ...prev,
      stops: [
        ...prev.stops,
        { id: Date.now() + Math.random(), stop_name: '', stop_order: prev.stops.length + 1 },
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

  // ── Modal Handlers ────────────────────────────────────────────────────────
  const openAddModal = () => {
    setEditingRoute(null);
    setFormData(emptyForm);
    setApiError('');
    setIsModalOpen(true);
  };

  const openEditModal = (route) => {
    setEditingRoute(route);
    const initialStops = Array.isArray(route.stops) ? route.stops : [];
    setFormData({
      route_code: route.route_code || '',
      route_name: route.route_name || '',
      origin: route.origin || '',
      destination: route.destination || '',
      stops: initialStops.map((s, idx) => ({
        id: s.id || idx + 1,
        stop_name: (typeof s === 'string' ? s : (s.stop_name || s.name || '')).toUpperCase(),
        stop_order: s.stop_order !== undefined ? Number(s.stop_order) : idx + 1,
      })),
    });
    setApiError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRoute(null);
    setFormData(emptyForm);
    setApiError('');
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // ── Save Route (Create / Update) ──────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setApiError('');

    const cleanCode = (formData.route_code || '').trim();
    const cleanName = (formData.route_name || '').trim();

    if (!cleanCode) {
      setApiError('Route Code is required');
      return;
    }
    if (!cleanName) {
      setApiError('Route Name is required');
      return;
    }

    // Filter out blank stop names and serialize sequence
    const serializedStops = (formData.stops || [])
      .map((s, idx) => ({
        id: s.id || idx + 1,
        stop_name: (s.stop_name || '').trim().toUpperCase(),
        stop_order: idx + 1,
      }))
      .filter((s) => s.stop_name.length > 0);

    const payload = {
      route_code: cleanCode,
      route_name: cleanName,
      origin: (formData.origin || '').trim() || null,
      destination: (formData.destination || '').trim() || null,
      stops: serializedStops,
    };

    setSaving(true);
    try {
      if (editingRoute) {
        const res = await apiClient.put(`/api/routes/${editingRoute.id}`, payload);
        const updated = res.data || res;
        setRoutes((prev) =>
          prev.map((r) =>
            r.id === editingRoute.id ? { ...r, ...payload, ...updated } : r
          )
        );
      } else {
        const res = await apiClient.post('/api/routes', payload);
        const created = res.data || res;
        setRoutes((prev) => [...prev, created]);
      }
      closeModal();
    } catch (err) {
      console.error('handleSave error:', err.message);
      setApiError(err.message || 'Failed to save route. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete Route ──────────────────────────────────────────────────────────
  const confirmDelete = (route) => {
    setRouteToDelete(route);
  };

  const handleDeleteCancel = () => {
    setRouteToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!routeToDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/routes/${routeToDelete.id}`);
      setRoutes((prev) => prev.filter((r) => r.id !== routeToDelete.id));
      setRouteToDelete(null);
    } catch (err) {
      console.error('handleDelete error:', err.message);
      alert(err.message || 'Failed to delete route.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="routes-page">
      {/* ── Toolbar ───────────────────────────────── */}
      <div className="routes-toolbar">
        {/* Search bar */}
        <div className="routes-search">
          <Search size={16} className="routes-search__icon" />
          <input
            type="text"
            className="routes-search__input"
            placeholder="Search by route code, name, origin, destination..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Add Route button */}
        <button
          id="add-route-btn"
          className="btn-orange routes-add-btn"
          onClick={openAddModal}
        >
          <Plus size={17} strokeWidth={2.5} />
          Add Route
        </button>
      </div>

      {/* ── Table container ───────────────────────── */}
      <div className="routes-table-wrap">
        <div className="routes-table-container">
          <table className="routes-table">
            <thead>
              <tr>
                <th className="routes-table__th" style={{ width: '6%' }}>ID</th>
                <th className="routes-table__th" style={{ width: '13%' }}>Route Code</th>
                <th className="routes-table__th" style={{ width: '20%' }}>Route Name</th>
                <th className="routes-table__th" style={{ width: '25%' }}>Stops Sequence</th>
                <th className="routes-table__th" style={{ width: '14%' }}>Origin</th>
                <th className="routes-table__th" style={{ width: '14%' }}>Destination</th>
                <th className="routes-table__th" style={{ width: '8%' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="routes-table__empty">
                    <div className="routes-loading-spinner">Loading routes…</div>
                  </td>
                </tr>
              ) : filteredRoutes.length > 0 ? (
                filteredRoutes.map((route) => {
                  const stopsList = Array.isArray(route.stops) ? route.stops : [];
                  const stopNames = stopsList.map((s) =>
                    typeof s === 'string' ? s : s.stop_name || s.name || ''
                  ).filter(Boolean);

                  return (
                    <tr key={route.id} className="routes-table__row">
                      {/* ID */}
                      <td className="routes-table__td routes-table__td--id">
                        #{route.id}
                      </td>

                      {/* Route Code */}
                      <td className="routes-table__td">
                        <span className="route-code-badge">
                          {route.route_code || '—'}
                        </span>
                      </td>

                      {/* Route Name */}
                      <td className="routes-table__td routes-table__td--name">
                        <div className="route-name-text">
                          {route.route_name || '—'}
                        </div>
                      </td>

                      {/* Stops Sequence */}
                      <td className="routes-table__td">
                        {stopNames.length > 0 ? (
                          <div
                            className="route-stops-cell"
                            title={stopNames.join(' → ')}
                          >
                            <span className="route-stops-badge">
                              {stopNames.length} {stopNames.length === 1 ? 'STOP' : 'STOPS'}
                            </span>
                            <span className="route-stops-chain">
                              {stopNames.slice(0, 3).join(' → ')}
                              {stopNames.length > 3 ? ` + ${stopNames.length - 3} more` : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="route-no-stops">No stops configured</span>
                        )}
                      </td>

                      {/* Origin */}
                      <td className="routes-table__td">
                        <div className="route-location-cell">
                          <MapPin size={13} className="route-loc-icon route-loc-icon--origin" />
                          <span>{route.origin || '—'}</span>
                        </div>
                      </td>

                      {/* Destination */}
                      <td className="routes-table__td">
                        <div className="route-location-cell">
                          <Navigation size={13} className="route-loc-icon route-loc-icon--dest" />
                          <span>{route.destination || '—'}</span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="routes-table__td routes-table__td--actions">
                        <div className="routes-actions">
                          <button
                            className="icon-btn"
                            title="Edit route"
                            onClick={() => openEditModal(route)}
                          >
                            <Edit2 size={15} strokeWidth={2} />
                          </button>
                          <button
                            className="icon-btn icon-btn--danger"
                            title="Delete route"
                            onClick={() => confirmDelete(route)}
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
                  <td colSpan="7" className="routes-table__empty">
                    {routes.length === 0
                      ? 'No routes have been added yet. Click "+ Add Route" to get started.'
                      : 'No routes match your search keyword.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add / Edit Modal with Dynamic Stop Builder ── */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-panel routes-modal" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button className="modal-close-btn" onClick={closeModal} title="Close">
              <X size={14} strokeWidth={2.5} />
            </button>

            {/* Title */}
            <div className="routes-modal__header">
              <h2 className="routes-modal__title">
                {editingRoute ? 'Edit Route & Stops' : 'Add New Route'}
              </h2>
            </div>

            {/* Form */}
            <form onSubmit={handleSave}>
              <div className="routes-modal__body">
                {/* Basic Route Details Grid */}
                <div className="routes-modal__grid">
                  {/* Route Code */}
                  <div className="routes-modal__field">
                    <label className="form-label">Route Code *</label>
                    <input
                      className="form-input"
                      placeholder="e.g. RT_SANKAR or 542"
                      value={formData.route_code}
                      onChange={(e) => updateField('route_code', e.target.value)}
                      required
                    />
                  </div>

                  {/* Route Name */}
                  <div className="routes-modal__field">
                    <label className="form-label">Route Name *</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Sankaranpalayam"
                      value={formData.route_name}
                      onChange={(e) => updateField('route_name', e.target.value)}
                      required
                    />
                  </div>

                  {/* Origin */}
                  <div className="routes-modal__field">
                    <label className="form-label">Origin</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Sankaranpalayam"
                      value={formData.origin}
                      onChange={(e) => updateField('origin', e.target.value)}
                    />
                  </div>

                  {/* Destination */}
                  <div className="routes-modal__field">
                    <label className="form-label">Destination</label>
                    <input
                      className="form-input"
                      placeholder="e.g. AMCET"
                      value={formData.destination}
                      onChange={(e) => updateField('destination', e.target.value)}
                    />
                  </div>
                </div>

                {/* ── Dynamic Route Stops Builder ───────── */}
                <div className="routes-modal__stops-section">
                  <div className="routes-modal__stops-header">
                    <div className="routes-stops-title-wrap">
                      <ListOrdered size={15} className="routes-stops-icon" />
                      <label className="form-label" style={{ margin: 0 }}>
                        ROUTE STOPS (IN SEQUENCE)
                      </label>
                    </div>
                    <span className="routes-stops-badge">
                      {formData.stops.length} {formData.stops.length === 1 ? 'STOP' : 'STOPS'}
                    </span>
                  </div>

                  <div className="routes-modal__stops-list">
                    {formData.stops.map((stop, idx) => (
                      <div key={stop.id || idx} className="routes-modal__stop-row">
                        <span className="route-stop-idx">{idx + 1}.</span>
                        <input
                          className="form-input route-stop-input"
                          placeholder={`e.g. STOP ${idx + 1} NAME`}
                          value={stop.stop_name}
                          onChange={(e) => handleUpdateStopName(idx, e.target.value)}
                          autoFocus={idx === formData.stops.length - 1 && stop.stop_name === ''}
                        />
                        <div className="route-stop-controls">
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={idx === 0}
                            onClick={() => handleMoveStop(idx, 'up')}
                            title="Move Up"
                          >
                            <ChevronUp size={13} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={idx === formData.stops.length - 1}
                            onClick={() => handleMoveStop(idx, 'down')}
                            title="Move Down"
                          >
                            <ChevronDown size={13} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn icon-btn--danger"
                            onClick={() => handleRemoveStop(idx)}
                            title="Delete Stop"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {formData.stops.length === 0 && (
                      <div className="routes-stops-empty">
                        No stops added yet. Click &quot;+ Add Stop&quot; to build the route sequence.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn-ghost routes-add-stop-btn"
                    onClick={handleAddStop}
                  >
                    <Plus size={15} /> Add Stop
                  </button>
                </div>

                {/* Error Banner */}
                {apiError && <div className="routes-modal__error">{apiError}</div>}

                {/* Modal Actions */}
                <div className="routes-modal__footer">
                  <button type="button" className="btn-ghost" onClick={closeModal}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-orange routes-modal__save-btn"
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : editingRoute ? 'Update Route' : 'Add Route'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ─────────────── */}
      {routeToDelete && (
        <div className="modal-overlay" onClick={handleDeleteCancel}>
          <div
            className="modal-panel routes-delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              className="modal-close-btn"
              onClick={handleDeleteCancel}
              title="Close"
            >
              <X size={14} strokeWidth={2.5} />
            </button>

            {/* Red icon */}
            <div className="routes-delete-modal__icon">
              <Trash2 size={28} color="#ef4444" strokeWidth={2} />
            </div>

            <h2 className="routes-delete-modal__title">Delete Route</h2>
            <p className="routes-delete-modal__msg">
              Are you sure you want to delete <strong>{routeToDelete.route_name}</strong> ({routeToDelete.route_code})?
              This will remove the route and its associated stops configuration.
            </p>
            <div className="routes-delete-modal__actions">
              <button className="btn-ghost" onClick={handleDeleteCancel}>
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

      {/* ── Page-scoped styles ───────────────────────── */}
      <style>{`
        .routes-page {
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow: hidden;
        }

        /* Toolbar */
        .routes-toolbar {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-shrink: 0;
        }

        .routes-search {
          flex: 1;
          max-width: 440px;
          position: relative;
          display: flex;
          align-items: center;
        }

        .routes-search__icon {
          position: absolute;
          left: 13px;
          color: var(--color-text-faint);
          pointer-events: none;
          flex-shrink: 0;
        }

        .routes-search__input {
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

        .routes-search__input::placeholder { color: var(--color-text-faint); }
        .routes-search__input:hover { border-color: #c8d5e0; }
        .routes-search__input:focus {
          border-color: var(--color-blue);
          box-shadow: 0 0 0 3px rgba(52,152,219,0.12), var(--shadow-card);
        }

        .routes-add-btn {
          flex-shrink: 0;
          white-space: nowrap;
        }

        /* Table wrapper */
        .routes-table-wrap {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }

        .routes-table-container {
          background: var(--color-card-bg);
          border-radius: var(--radius-lg);
          border: 1px solid var(--color-border);
          box-shadow: var(--shadow-card);
          overflow: hidden;
        }

        .routes-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .routes-table__th {
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

        .routes-table__row {
          transition: background var(--transition-fast);
        }
        .routes-table__row:hover { background: #f7fafc; }
        .routes-table__row:not(:last-child) td {
          border-bottom: 1px solid var(--color-border-soft);
        }

        .routes-table__td {
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

        .routes-table__td--id {
          font-weight: 700;
          color: var(--color-blue);
        }

        .routes-table__td--name {
          font-weight: 600;
          color: var(--color-text-primary);
        }

        .route-code-badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 4px;
          background: #edf2f7;
          color: #2d3748;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .route-stops-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          max-width: 100%;
        }

        .route-stops-badge {
          display: inline-block;
          font-size: 10.5px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: var(--radius-full);
          background: #e0f2fe;
          color: #0369a1;
          letter-spacing: 0.02em;
        }

        .route-stops-chain {
          font-size: 11px;
          color: var(--color-text-muted);
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .route-no-stops {
          font-size: 11.5px;
          color: var(--color-text-faint);
          font-style: italic;
        }

        .route-location-cell {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .route-loc-icon { flex-shrink: 0; }
        .route-loc-icon--origin { color: #3182ce; }
        .route-loc-icon--dest { color: #e53e3e; }

        .routes-table__td--actions { overflow: visible; }
        .routes-actions {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .routes-actions .icon-btn {
          width: 30px;
          height: 30px;
          border-radius: var(--radius-sm);
        }

        .routes-table__empty {
          padding: 48px 16px;
          text-align: center;
          color: var(--color-text-faint);
          font-size: 13.5px;
          font-weight: 500;
        }

        .routes-loading-spinner {
          display: inline-block;
          font-size: 13.5px;
          color: var(--color-text-muted);
        }

        /* Modal */
        .routes-modal {
          max-width: 540px;
          padding: 0;
          overflow: hidden;
        }

        .routes-modal__header {
          padding: 22px 24px 16px;
          border-bottom: 1px solid var(--color-border-soft);
        }

        .routes-modal__title {
          margin: 0;
          font-size: 17px;
          font-weight: 700;
          color: var(--color-text-primary);
          letter-spacing: -0.01em;
        }

        .routes-modal__body {
          padding: 20px 24px 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-height: 80vh;
          overflow-y: auto;
        }

        .routes-modal__grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px 16px;
        }

        .routes-modal__field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        /* Stops Section in Modal */
        .routes-modal__stops-section {
          border-top: 1px solid var(--color-border-soft);
          padding-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .routes-modal__stops-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .routes-stops-title-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .routes-stops-icon {
          color: var(--color-blue);
        }

        .routes-modal__stops-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 200px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .routes-modal__stop-row {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f7f9fc;
          padding: 6px 10px;
          border-radius: var(--radius-md);
          border: 1px solid var(--color-border-soft);
        }

        .route-stop-idx {
          font-size: 11.5px;
          font-weight: 700;
          color: var(--color-text-muted);
          min-width: 22px;
        }

        .route-stop-input {
          height: 34px !important;
          font-size: 12.5px !important;
          padding: 0 10px !important;
          flex: 1;
        }

        .route-stop-controls {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .route-stop-controls .icon-btn {
          width: 28px;
          height: 28px;
        }

        .route-stop-controls .icon-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .routes-stops-empty {
          text-align: center;
          font-size: 12px;
          color: var(--color-text-faint);
          padding: 14px 0;
          background: #f7fafc;
          border-radius: var(--radius-md);
          border: 1px dashed var(--color-border);
        }

        .routes-add-stop-btn {
          height: 36px;
          font-size: 12.5px;
          width: 100%;
          justify-content: center;
        }

        .routes-modal__error {
          padding: 10px 14px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: var(--radius-sm);
          color: #dc2626;
          font-size: 13px;
          text-align: center;
        }

        .routes-modal__footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 4px;
        }

        .routes-modal__save-btn {
          min-width: 130px;
        }

        /* Delete modal */
        .routes-delete-modal {
          padding: 32px 28px 28px;
          max-width: 380px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .routes-delete-modal__icon {
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

        .routes-delete-modal__title {
          margin: 0 0 10px;
          font-size: 19px;
          font-weight: 700;
          color: var(--color-text-primary);
          letter-spacing: -0.01em;
        }

        .routes-delete-modal__msg {
          margin: 0 0 24px;
          font-size: 13.5px;
          color: var(--color-text-muted);
          line-height: 1.6;
          max-width: 280px;
        }

        .routes-delete-modal__actions {
          display: flex;
          gap: 12px;
          width: 100%;
        }

        .routes-delete-modal__actions .btn-ghost,
        .routes-delete-modal__actions .btn-danger {
          flex: 1;
        }
      `}</style>
    </div>
  );
};

export default RoutesPage;

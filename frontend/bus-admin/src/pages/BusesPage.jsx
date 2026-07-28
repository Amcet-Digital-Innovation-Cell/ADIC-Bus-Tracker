import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, X, Search } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://bus-tracking-backend-8sjh.onrender.com';

// Helper to get stored JWT token
const getToken = () => sessionStorage.getItem('authToken');

// Map Supabase column names → frontend field names
const mapFromDb = (row) => ({
  id: row.id,
  busId: row.bus_number || '',
  busNo: row.registration_number || '',
  driver: row.driver_name || '',
  contact: row.driver_phone || '',
  route: row.route_name || '',
  license: row.license_number || '',
  status: row.status || 'Pending (GPS)',
  latitude: row.latitude,
  longitude: row.longitude,
});

const BusesPage = ({ buses, setBuses }) => {

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBus, setEditingBus] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [busToDelete, setBusToDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [apiError, setApiError] = useState('');
  const cancelDeleteRef = useRef(null);

  const emptyForm = { route: '', busNo: '', busId: '', driver: '', contact: '', license: '' };
  const [formData, setFormData] = useState(emptyForm);

  // ── Load buses from Supabase on mount ──────────────────────────────────────
  useEffect(() => {
    const fetchBuses = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/buses`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error(`Failed to load buses (${res.status})`);
        const data = await res.json();
        setBuses(Array.isArray(data) ? data.map(mapFromDb) : []);
      } catch (err) {
        console.error('fetchBuses:', err.message);
      }
    };
    fetchBuses();
  }, []);

  // Filter logic
  const filteredBuses = buses.filter(bus =>
    (bus.busNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (bus.route || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (bus.driver || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── Create / Update ────────────────────────────────────────────────────────
  const handleSave = async () => {
    setApiError('');
    setSaving(true);
    try {
      const payload = {
        busNo: formData.busNo,
        busId: formData.busId,
        driver: formData.driver,
        contact: formData.contact,
        route: formData.route,
        license: formData.license,
      };

      if (editingBus) {
        // UPDATE
        const res = await fetch(`${API_BASE}/api/buses/${editingBus.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Update failed');
        const updated = mapFromDb(json.data);
        setBuses(buses.map(b => b.id === editingBus.id ? updated : b));
      } else {
        // CREATE
        const res = await fetch(`${API_BASE}/api/buses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Create failed');
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

  // ── Delete ─────────────────────────────────────────────────────────────────
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
        throw new Error(json.message || 'Delete failed');
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

  /* ESC closes the delete modal; auto-focus Cancel */
  useEffect(() => {
    if (!busToDelete) return;
    const handler = (e) => { if (e.key === 'Escape') handleDeleteCancel(); };
    document.addEventListener('keydown', handler);
    cancelDeleteRef.current?.focus();
    return () => document.removeEventListener('keydown', handler);
  }, [busToDelete]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '24px', backgroundColor: '#f9fafb' }}>
      {/* Search Bar and Add Button Container */}
      <div className="flex justify-between items-center mb-6 gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search by bus no, route, or driver..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:gray-300 focus:border-gray-300 transition"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          onClick={() => { setFormData(emptyForm); setEditingBus(null); setIsModalOpen(true); }}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-semibold transition-colors"
        >
          <Plus size={18} /> Add Bus
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div className="bg-white rounded-xl shadow border overflow-hidden">
          <table className="w-full text-center table-fixed border-collapse">
            <thead className="bg-gray-100 text-gray-600 text-xs uppercase font-bold">
              <tr>
                {['Bus ID', 'Route', 'Bus No', 'Driver', 'Contact', 'License', 'Status', 'Action'].map(h => (
                  <th key={h} className="p-3 border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredBuses.length > 0 ? (
                filteredBuses.map((bus) => (
                  <tr key={bus.id} className="hover:bg-gray-50">
                    <td className="p-3 border font-semibold text-blue-700">{bus.busId || '—'}</td>
                    <td className="p-3 border">{bus.route}</td>
                    <td className="p-3 border">{bus.busNo}</td>
                    <td className="p-3 border">{bus.driver}</td>
                    <td className="p-3 border">{bus.contact}</td>
                    <td className="p-3 border">{bus.license}</td>
                    <td className="p-3 border">
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '2px 9px',
                        borderRadius: '20px', whiteSpace: 'nowrap',
                        color: bus.status === 'Active' ? '#2d9e5f' : bus.status === 'Inactive' ? '#e53e3e' : '#e28743',
                        background: bus.status === 'Active' ? '#f0fff4' : bus.status === 'Inactive' ? '#fff5f5' : '#fffaf0',
                      }}>{bus.status}</span>
                    </td>
                    <td className="p-3 border">
                      <div className="flex justify-center gap-4">
                        <button
                          onClick={() => { setEditingBus(bus); setFormData(bus); setIsModalOpen(true); }}
                          className="text-blue-500 hover:scale-110 transition-transform"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => confirmDelete(bus)}
                          className="text-red-500 hover:scale-110 transition-transform"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-gray-400">
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

      {/* Modal with explicit Labels */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-lg relative shadow-xl">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700">
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold mb-4">{editingBus ? "Edit Bus" : "Add Bus"}</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-600">Bus Id</label>
                <input className="border p-2 rounded w-full" placeholder="ex:01" onChange={e => setFormData({ ...formData, busId: e.target.value })} value={formData.busId} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-600">Route</label>
                <input className="border p-2 rounded w-full" placeholder="ex:Katpadi" onChange={e => setFormData({ ...formData, route: e.target.value })} value={formData.route} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-600">Bus No</label>
                <input className="border p-2 rounded w-full" placeholder="ex:TN 33 BA 1234" onChange={e => setFormData({ ...formData, busNo: e.target.value })} value={formData.busNo} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-600">Driver</label>
                <input className="border p-2 rounded w-full" placeholder="ex:Rajesh" onChange={e => setFormData({ ...formData, driver: e.target.value })} value={formData.driver} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-600">Contact</label>
                <input className="border p-2 rounded w-full" placeholder="ex: +91 9876543210" onChange={e => setFormData({ ...formData, contact: e.target.value })} value={formData.contact} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-600">License</label>
                <input className="border p-2 rounded w-full" placeholder="ex: AD 32545" onChange={e => setFormData({ ...formData, license: e.target.value })} value={formData.license} />
              </div>
            </div>

            {apiError && (
              <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '8px', color: '#dc2626', fontSize: '13px', textAlign: 'center' }}>
                {apiError}
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2 mt-5 rounded font-bold transition-colors"
              style={{ opacity: saving ? 0.65 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* ── Delete-confirmation modal ── */}
      {busToDelete && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px', boxSizing: 'border-box',
            animation: 'overlay-fade-in 0.2s ease',
          }}
          onClick={handleDeleteCancel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-bus-title"
        >
          <div
            style={{
              position: 'relative',
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.10)',
              padding: '32px 28px 28px',
              width: '100%',
              maxWidth: '380px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              animation: 'modal-scale-in 0.25s cubic-bezier(0.34,1.28,0.64,1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close ✕ */}
            <button
              onClick={handleDeleteCancel}
              style={{
                position: 'absolute', top: '14px', right: '14px',
                width: '28px', height: '28px', borderRadius: '8px',
                border: '1px solid #e8edf4', background: '#f7fafc',
                color: '#a0aec0', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#fff5f5'; e.currentTarget.style.color = '#e53e3e'; e.currentTarget.style.borderColor = '#fed7d7'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f7fafc'; e.currentTarget.style.color = '#a0aec0'; e.currentTarget.style.borderColor = '#e8edf4'; }}
            >
              <X size={14} />
            </button>

            {/* Red icon badge */}
            <div style={{
              width: '60px', height: '60px', borderRadius: '50%',
              background: '#fff5f5', border: '2px solid #fed7d7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '18px',
            }}>
              <Trash2 size={28} color="#ef4444" strokeWidth={2} />
            </div>

            {/* Title */}
            <h2 id="delete-bus-title" style={{ margin: '0 0 10px', fontSize: '20px', fontWeight: 700, color: '#1a202c', letterSpacing: '-0.01em' }}>
              Delete Bus
            </h2>

            {/* Message */}
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#718096', lineHeight: 1.6, maxWidth: '280px' }}>
              Are you sure to delete <strong style={{ color: '#1a202c' }}>Bus {busToDelete.busNo}</strong> ({busToDelete.route})? This action cannot be undone.
            </p>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button
                ref={cancelDeleteRef}
                onClick={handleDeleteCancel}
                style={{
                  flex: 1, height: '42px', borderRadius: '10px',
                  border: '1px solid #e2e8f0', background: '#f7fafc',
                  color: '#4a5568', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer', transition: 'background 0.18s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#edf2f7'; e.currentTarget.style.borderColor = '#cbd5e0'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#f7fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{
                  flex: 1, height: '42px', borderRadius: '10px',
                  border: 'none', background: '#ef4444',
                  color: '#ffffff', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '6px',
                  boxShadow: '0 2px 8px rgba(239,68,68,0.25)',
                  transition: 'background 0.18s ease, box-shadow 0.18s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#dc2626'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(239,68,68,0.35)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(239,68,68,0.25)'; }}
              >
                <Trash2 size={14} strokeWidth={2} />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusesPage;
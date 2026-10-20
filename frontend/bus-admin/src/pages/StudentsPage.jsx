import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Plus,
  Search,
  Users,
  CheckCircle2,
  Clock,
  Trash2,
  X,
  RefreshCw,
  FilterX,
  GraduationCap,
  AlertTriangle,
  UploadCloud,
  FileText,
  Check,
  Percent,
} from 'lucide-react';
import { studentService, ACADEMIC_YEARS, mapYearToDb, mapDbToDisplayYear } from '../lib/studentService';
import ErrorBoundary from '../components/ErrorBoundary';
import './Students.css';

function StudentsPageContent() {
  // ── Main Data & Loading States ──────────────────────────────────────────
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Search & Filter States ──────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // ── Modal States ────────────────────────────────────────────────────────
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('single'); // 'single' | 'bulk'
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicateConfirmModal, setDuplicateConfirmModal] = useState(null);

  // ── Single Student Form State & Validation ──────────────────────────────
  const [singleForm, setSingleForm] = useState({
    student_id: '',
    student_name: '',
    year: '1st Year',
  });
  const [singleErrors, setSingleErrors] = useState({});
  const [singleSubmitting, setSingleSubmitting] = useState(false);

  // ── Bulk Entry State ───────────────────────────────────────────────────
  const [bulkText, setBulkText] = useState('');
  const [bulkParsed, setBulkParsed] = useState([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  // ── Modal State Reset & Open/Close Handlers ─────────────────────────────
  const resetAddModalForms = useCallback(() => {
    setSingleForm({
      student_id: '',
      student_name: '',
      year: '1st Year',
    });
    setSingleErrors({});
    setBulkText('');
    setBulkParsed([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleOpenAddModal = useCallback((tab = 'single') => {
    resetAddModalForms();
    setActiveTab(tab);
    setDuplicateConfirmModal(null);
    setIsAddModalOpen(true);
  }, [resetAddModalForms]);

  const handleCloseAddModal = useCallback(() => {
    if (singleSubmitting || bulkSubmitting) return;
    setIsAddModalOpen(false);
    setDuplicateConfirmModal(null);
    resetAddModalForms();
  }, [singleSubmitting, bulkSubmitting, resetAddModalForms]);

  // ── Toast Notifications ─────────────────────────────────────────────────
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // ── Data Fetching ───────────────────────────────────────────────────────
  const loadStudents = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await studentService.fetchStudents();
      setStudents(Array.isArray(data) ? data : []);
      if (isManualRefresh) {
        showToast('Student roster refreshed successfully', 'success');
      }
    } catch (err) {
      console.error('[StudentsPage] Failed to load students:', err);
      setError(err?.message || 'Failed to load students from server.');
      setStudents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    studentService.fetchStudents()
      .then((data) => {
        if (isMounted) {
          setStudents(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err?.message || 'Failed to load students from server.');
          setStudents([]);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // ── Filter & Search Logic ──────────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    if (!Array.isArray(students)) return [];
    return students.filter((std) => {
      if (!std) return false;

      // Search by ID or Name
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchesId = (std.student_id || '').toLowerCase().includes(q);
        const matchesName = (std.student_name || std.name || '').toLowerCase().includes(q);
        if (!matchesId && !matchesName) return false;
      }

      // Year filter
      if (selectedYear !== 'ALL') {
        if (std.year !== selectedYear) return false;
      }

      // Registration Status filter
      if (selectedStatus !== 'ALL') {
        const isReg = std.is_registered === true || std.registration_status === 'Registered';
        if (selectedStatus === 'Registered' && !isReg) return false;
        if (selectedStatus === 'Not Registered' && isReg) return false;
      }

      return true;
    });
  }, [students, searchQuery, selectedYear, selectedStatus]);

  // ── KPI Metrics Calculations ───────────────────────────────────────────
  const metrics = useMemo(() => {
    const list = Array.isArray(students) ? students : [];
    const total = list.length;
    const registered = list.filter((s) => s.is_registered === true || s.registration_status === 'Registered').length;
    const notRegistered = Math.max(0, total - registered);
    const rate = total > 0 ? Math.round((registered / total) * 100) : 0;

    return { total, registered, notRegistered, rate };
  }, [students]);

  const hasActiveFilters = searchQuery !== '' || selectedYear !== 'ALL' || selectedStatus !== 'ALL';

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedYear('ALL');
    setSelectedStatus('ALL');
  };

  // ── Single Student Validation & Submission ──────────────────────────────
  const validateSingleForm = () => {
    const errors = {};
    const cleanId = singleForm.student_id.trim();
    if (!cleanId) {
      errors.student_id = 'Student ID (ID Card number) is required';
    } else if (students.some((s) => String(s.student_id || '').trim().toUpperCase() === cleanId.toUpperCase())) {
      errors.student_id = `Student ID "${cleanId}" already exists in the system`;
    }
    if (!(singleForm.student_name || '').trim()) {
      errors.student_name = 'Student Name is required';
    }
    if (!singleForm.year.trim()) {
      errors.year = 'Academic Year is required';
    }
    setSingleErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    if (!validateSingleForm()) return;

    setSingleSubmitting(true);
    try {
      // Map academic year to database format (e.g., "1st Year" -> "1.0")
      const mappedDbYear = mapYearToDb(singleForm.year);

      const added = await studentService.addStudent({
        student_id: singleForm.student_id.trim(),
        student_name: singleForm.student_name.trim(),
        year: mappedDbYear,
        academic_year: mappedDbYear,
      });

      // Update state
      setStudents((prev) => [added, ...prev]);
      showToast(`Student ${added.student_name || added.name} added successfully!`, 'success');

      // Reset form & close modal
      handleCloseAddModal();
    } catch (err) {
      console.error('[StudentsPage] Add student error:', err);
      showToast(err.message || 'Failed to add student. Please try again.', 'error');
    } finally {
      setSingleSubmitting(false);
    }
  };

  // ── Bulk Parser & Submission ───────────────────────────────────────────
  const parseBulkInput = (rawText) => {
    if (!rawText.trim()) {
      setBulkParsed([]);
      return;
    }

    const lines = rawText.split('\n');
    const parsed = [];
    const seenIdsInText = new Set();
    const existingIdSet = new Set(
      students.map((s) => String(s.student_id || '').trim().toUpperCase()).filter(Boolean)
    );

    lines.forEach((line, index) => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      // Ignore common header line (e.g. "Student ID, Name, Year")
      if (
        index === 0 &&
        (cleanLine.toLowerCase().includes('student id') || cleanLine.toLowerCase().includes('roll'))
      ) {
        return;
      }

      // Supports comma or tab separated
      const parts = cleanLine.includes('\t') ? cleanLine.split('\t') : cleanLine.split(',');
      const student_id = (parts[0] || '').trim();
      const name = (parts[1] || '').trim();
      let year = (parts[2] || '').trim();

      // Normalize common year representations to DB format ("1.0", "2.0", etc.)
      const dbYear = mapYearToDb(year);
      const displayYear = mapDbToDisplayYear(year);

      const isValid = Boolean(student_id && name);
      const student_name = name;
      const upperId = student_id.toUpperCase();
      const isDuplicate = isValid && (existingIdSet.has(upperId) || seenIdsInText.has(upperId));
      if (isValid) {
        seenIdsInText.add(upperId);
      }

      parsed.push({
        lineNum: index + 1,
        student_id,
        student_name,
        name: student_name,
        year: dbYear,
        displayYear,
        isValid,
        isDuplicate,
        error: !student_id ? 'Missing ID' : !student_name ? 'Missing Name' : isDuplicate ? 'Duplicate ID' : null,
      });
    });

    setBulkParsed(parsed);
  };

  const handleBulkTextChange = (e) => {
    const val = e.target.value;
    setBulkText(val);
    parseBulkInput(val);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result || '';
      setBulkText(content);
      parseBulkInput(content);
    };
    reader.readAsText(file);
    // Reset file input value so re-uploading the same file works
    e.target.value = '';
  };

  const loadSampleBulk = () => {
    const sample = `23IT001, Vigneshwaran K, 1st Year\n23IT002, Sneha Ramesh, 1st Year\n22CS014, Rahul Sundaram, 2nd Year\n22CS015, Ananya Nair, 2nd Year\n21EC030, Karthik Raja, 3rd Year`;
    setBulkText(sample);
    parseBulkInput(sample);
  };

  // Helper to execute API call for uploading students
  const executeBulkImport = async (studentsToImport, skippedDuplicatesCount = 0) => {
    setBulkSubmitting(true);
    try {
      const result = await studentService.addStudentsBulk(
        studentsToImport.map((s) => ({
          student_id: s.student_id,
          student_name: s.student_name || s.name,
          year: mapYearToDb(s.year),
          academic_year: mapYearToDb(s.year),
        }))
      );

      const importedCount = result.successCount || studentsToImport.length;
      if (skippedDuplicatesCount > 0) {
        showToast(
          `Imported ${importedCount} unique students successfully! (${skippedDuplicatesCount} duplicate ID(s) skipped)`,
          'success'
        );
      } else {
        showToast(`Imported ${importedCount} students successfully!`, 'success');
      }

      await loadStudents();
      handleCloseAddModal();
    } catch (err) {
      console.error('[StudentsPage] Bulk import error:', err);
      showToast(err.message || 'Failed to import students', 'error');
    } finally {
      setBulkSubmitting(false);
    }
  };

  // Triggered when admin clicks "Import" button in Bulk modal
  const handleBulkSubmit = async () => {
    const validStudents = bulkParsed.filter((s) => s.isValid);
    if (validStudents.length === 0) {
      showToast('No valid students found to import', 'error');
      return;
    }

    const existingIdSet = new Set(
      students.map((s) => String(s.student_id || '').trim().toUpperCase()).filter(Boolean)
    );

    const duplicateRecords = [];
    const uniqueStudents = [];
    const seenInBatch = new Set();

    for (const std of validStudents) {
      const cleanId = String(std.student_id || '').trim().toUpperCase();
      if (existingIdSet.has(cleanId) || seenInBatch.has(cleanId)) {
        duplicateRecords.push(std);
      } else {
        seenInBatch.add(cleanId);
        uniqueStudents.push(std);
      }
    }

    // If duplicate IDs detected, dismiss background modal and prompt admin
    if (duplicateRecords.length > 0) {
      setIsAddModalOpen(false); // Seamlessly dismiss background modal so alert appears prominently
      setDuplicateConfirmModal({
        duplicates: duplicateRecords,
        uniqueStudents,
        totalCount: validStudents.length,
      });
      return;
    }

    // No duplicates found, upload all
    await executeBulkImport(uniqueStudents, 0);
  };

  // Dismiss duplicate confirmation and return back to the Add modal
  const handleCancelDuplicateModal = () => {
    setDuplicateConfirmModal(null);
    setIsAddModalOpen(true); // Re-open Add modal with user text and preview intact
  };

  // Confirmed to remove/skip duplicates and proceed with unique records
  const handleAgreeSkipDuplicates = async () => {
    if (!duplicateConfirmModal) return;
    const { uniqueStudents, duplicates } = duplicateConfirmModal;

    if (uniqueStudents.length === 0) {
      showToast('All student records in this CSV already exist in the database. 0 unique records to import.', 'warning');
      setDuplicateConfirmModal(null);
      setIsAddModalOpen(true);
      return;
    }

    const skippedCount = duplicates.length;
    setDuplicateConfirmModal(null);
    setIsAddModalOpen(false);
    await executeBulkImport(uniqueStudents, skippedCount);
  };

  // ── Delete Confirmation & Execution ────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!studentToDelete) return;

    setDeleting(true);
    const deleteId = studentToDelete.id || studentToDelete.student_id;

    try {
      await studentService.deleteStudent(deleteId);
      setStudents((prev) => prev.filter((s) => s.id !== studentToDelete.id && s.student_id !== studentToDelete.student_id));
      showToast(`Student ${studentToDelete.name} removed successfully`, 'warning');
      setStudentToDelete(null);
    } catch (err) {
      console.error('[StudentsPage] Delete error:', err);
      showToast(err.message || 'Failed to delete student record', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Initials generator for student avatar
  const getInitials = (student_name) => {
    const name = student_name;
    if (!name) return 'ST';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="students-page">
      {/* ── 1. Top Header Strip ────────────────────────────────────── */}
      <div className="students-header">
        <div className="students-header__left">
          <h1 className="students-header__title">Students Management</h1>
          <p className="students-header__subtitle">
            Pre-loaded student roster and app registration status for AMCET Transport
          </p>
        </div>

        <div className="students-header__actions">
          <button
            id="refresh-students-btn"
            className="btn-refresh"
            onClick={() => loadStudents(true)}
            disabled={loading || refreshing}
            title="Refresh student list"
          >
            <RefreshCw size={16} className={refreshing ? 'spin-animation' : ''} />
            <span>Refresh</span>
          </button>

          <button
            id="add-student-btn"
            className="btn-add-student"
            onClick={() => handleOpenAddModal('single')}
            title="Add a new student"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* ── 2. Metric KPI Cards ────────────────────────────────────── */}
      <div className="students-metrics">
        <div className="metric-pill metric-pill--total">
          <div className="metric-pill__icon">
            <Users size={20} strokeWidth={2.2} />
          </div>
          <div className="metric-pill__info">
            <span className="metric-pill__label">Total Pre-loaded</span>
            <span className="metric-pill__val">{metrics.total} Students</span>
          </div>
        </div>

        <div className="metric-pill metric-pill--registered">
          <div className="metric-pill__icon">
            <CheckCircle2 size={20} strokeWidth={2.2} />
          </div>
          <div className="metric-pill__info">
            <span className="metric-pill__label">Registered</span>
            <span className="metric-pill__val">{metrics.registered} Active</span>
          </div>
        </div>

        <div className="metric-pill metric-pill--pending">
          <div className="metric-pill__icon">
            <Clock size={20} strokeWidth={2.2} />
          </div>
          <div className="metric-pill__info">
            <span className="metric-pill__label">Not Registered</span>
            <span className="metric-pill__val">{metrics.notRegistered} Pending</span>
          </div>
        </div>

        <div className="metric-pill metric-pill--rate">
          <div className="metric-pill__icon">
            <Percent size={20} strokeWidth={2.2} />
          </div>
          <div className="metric-pill__info">
            <span className="metric-pill__label">Registration Rate</span>
            <span className="metric-pill__val">{metrics.rate}%</span>
          </div>
        </div>
      </div>

      {/* ── 3. Search and Filter Bar ─────────────────────────────────── */}
      <div className="students-filter-bar">
        <div className="filter-bar__search">
          <Search size={17} className="filter-search-icon" />
          <input
            id="student-search-input"
            type="text"
            className="filter-search-input"
            placeholder="Search by Student ID or Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="filter-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="filter-bar__dropdowns">
          {/* Year Filter */}
          <select
            id="filter-year"
            className={`filter-select ${selectedYear !== 'ALL' ? 'filter-select--active' : ''}`}
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            title="Filter by Academic Year"
          >
            <option value="ALL">All Years</option>
            {ACADEMIC_YEARS.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>

          {/* Registration Status Filter */}
          <select
            id="filter-status"
            className={`filter-select ${selectedStatus !== 'ALL' ? 'filter-select--active' : ''}`}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            title="Filter by Registration Status"
          >
            <option value="ALL">All Status</option>
            <option value="Registered">Registered</option>
            <option value="Not Registered">Not Registered</option>
          </select>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              id="clear-filters-btn"
              className="btn-clear-filters"
              onClick={handleClearFilters}
              title="Reset all filters"
            >
              <FilterX size={15} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 4. Main Student Table ────────────────────────────────────── */}
      <div className="students-table-card">
        {loading ? (
          <div className="students-loading-state">
            <RefreshCw size={32} className="spin-animation" style={{ color: 'var(--color-blue)' }} />
            <p>Loading pre-loaded student directory...</p>
          </div>
        ) : error ? (
          <div className="students-error-state">
            <AlertTriangle size={36} color="#e53e3e" />
            <p className="error-title">Unable to fetch students</p>
            <p className="error-msg">{error}</p>
            <button className="btn-retry" onClick={() => loadStudents()}>
              Try Again
            </button>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="students-empty-state">
            <GraduationCap size={48} color="var(--color-text-faint)" />
            <h3>No Students Found</h3>
            <p>
              {hasActiveFilters
                ? 'No students match your active search or filter criteria.'
                : 'No students have been pre-loaded yet into the system.'}
            </p>
            {hasActiveFilters ? (
              <button className="btn-secondary" onClick={handleClearFilters}>
                Clear Filters
              </button>
            ) : (
              <button
                className="btn-add-student"
                onClick={() => handleOpenAddModal('single')}
              >
                <Plus size={16} /> Add First Student
              </button>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="students-table" id="students-roster-table">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Student ID</th>
                  <th style={{ width: '38%' }}>Student Name</th>
                  <th style={{ width: '18%' }}>Year</th>
                  <th style={{ width: '14%' }}>Registration Status</th>
                  <th style={{ width: '8%', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((std) => {
                  const isRegistered = Boolean(
                    std.is_registered === true ||
                    std.registration_status === 'Registered' ||
                    (typeof std.activation_key === 'string' && std.activation_key.toUpperCase().startsWith('AM-')) ||
                    (Boolean(std.email) && String(std.email).trim().length > 0)
                  );

                  return (
                    <tr key={std.id || std.student_id}>
                      {/* 1. Student ID */}
                      <td>
                        <span className="student-id-badge" title="ID Card Number">
                          {std.student_id}
                        </span>
                      </td>

                      {/* 2. Student Name */}
                      <td>
                        <div className="student-name-cell">
                          <div className="student-avatar" aria-hidden="true">
                            {getInitials(std.student_name || std.name)}
                          </div>
                          <div className="student-name-meta">
                            <span className="student-name-text">{std.student_name || std.name}</span>
                            {std.department && (
                              <span className="student-dept-subtext">{std.department}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 3. Year */}
                      <td>
                        <span className="year-pill">{std.year}</span>
                      </td>

                      {/* 4. Registration Status */}
                      <td>
                        {isRegistered ? (
                          <div className="status-cell-wrap">
                            <span className="status-badge status-badge--registered">
                              <CheckCircle2 size={13} strokeWidth={2.5} />
                              Registered
                            </span>
                            {std.activation_key && (
                              <span
                                className="activation-key-pill"
                                title={`Activation Key: ${std.activation_key}`}
                              >
                                Key: <code>{std.activation_key}</code>
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="status-badge status-badge--pending">
                            <Clock size={13} strokeWidth={2.5} />
                            Not Registered
                          </span>
                        )}
                      </td>

                      {/* 5. Actions */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn-action-delete"
                          onClick={() => setStudentToDelete(std)}
                          title={`Delete ${std.student_name || std.name}`}
                          aria-label={`Delete student ${std.student_name || std.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer Count */}
        {!loading && !error && filteredStudents.length > 0 && (
          <div className="students-table-footer">
            <span>
              Showing <strong>{filteredStudents.length}</strong> of{' '}
              <strong>{students.length}</strong> pre-loaded students
            </span>
          </div>
        )}
      </div>

      {/* ── 5. Add Student Modal (Manual & Bulk Entry) ──────────────── */}
      {isAddModalOpen && !duplicateConfirmModal && (
        <div className="modal-overlay" onClick={handleCloseAddModal}>
          <div className="modal-dialog modal-dialog--md" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-header__title">
                <h2>Add Pre-loaded Students</h2>
                <p>Register eligible student records for transport access</p>
              </div>
              <button
                className="modal-close-btn"
                onClick={handleCloseAddModal}
                disabled={singleSubmitting || bulkSubmitting}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Tabs: Manual vs Bulk */}
            <div className="modal-tabs">
              <button
                className={`modal-tab ${activeTab === 'single' ? 'modal-tab--active' : ''}`}
                onClick={() => setActiveTab('single')}
              >
                Manual Entry
              </button>
              <button
                className={`modal-tab ${activeTab === 'bulk' ? 'modal-tab--active' : ''}`}
                onClick={() => setActiveTab('bulk')}
              >
                Bulk Entry (CSV)
              </button>
            </div>

            {/* Tab 1: Single Student Manual Entry */}
            {activeTab === 'single' && (
              <form onSubmit={handleSingleSubmit} className="modal-form" noValidate>
                {/* Student ID */}
                <div className="form-group">
                  <label htmlFor="student-id-input" className="form-label">
                    Student ID (ID Card Number) <span className="req">*</span>
                  </label>
                  <input
                    id="student-id-input"
                    type="text"
                    className={`form-input ${singleErrors.student_id ? 'form-input--error' : ''}`}
                    placeholder="e.g., 22IT045 or AMC202401"
                    value={singleForm.student_id}
                    onChange={(e) => {
                      setSingleForm({ ...singleForm, student_id: e.target.value });
                      if (singleErrors.student_id) setSingleErrors({ ...singleErrors, student_id: null });
                    }}
                    autoFocus
                  />
                  {singleErrors.student_id && (
                    <span className="field-error-msg">{singleErrors.student_id}</span>
                  )}
                </div>

                {/* Student Name */}
                <div className="form-group">
                  <label htmlFor="student-name-input" className="form-label">
                    Student Name <span className="req">*</span>
                  </label>
                  <input
                    id="student-name-input"
                    type="text"
                    className={`form-input ${singleErrors.student_name ? 'form-input--error' : ''}`}
                    placeholder="e.g., Alex Johnson"
                    value={singleForm.student_name}
                    onChange={(e) => {
                      setSingleForm({ ...singleForm, student_name: e.target.value });
                      if (singleErrors.student_name) setSingleErrors({ ...singleErrors, student_name: null });
                    }}
                  />
                  {singleErrors.student_name && (
                    <span className="field-error-msg">{singleErrors.student_name}</span>
                  )}
                </div>

                {/* Academic Year */}
                <div className="form-group">
                  <label htmlFor="student-year-select" className="form-label">
                    Academic Year <span className="req">*</span>
                  </label>
                  <select
                    id="student-year-select"
                    className={`form-select ${singleErrors.year ? 'form-input--error' : ''}`}
                    value={singleForm.year}
                    onChange={(e) => {
                      setSingleForm({ ...singleForm, year: e.target.value });
                      if (singleErrors.year) setSingleErrors({ ...singleErrors, year: null });
                    }}
                  >
                    {ACADEMIC_YEARS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                  {singleErrors.year && (
                    <span className="field-error-msg">{singleErrors.year}</span>
                  )}
                </div>

                {/* Modal Actions */}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={handleCloseAddModal}
                    disabled={singleSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-submit-primary"
                    disabled={singleSubmitting}
                  >
                    {singleSubmitting ? (
                      <>
                        <RefreshCw size={16} className="spin-animation" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check size={16} /> Save Student
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Tab 2: Bulk Entry */}
            {activeTab === 'bulk' && (
              <div className="modal-form bulk-form">
                <div className="bulk-instructions">
                  <p>
                    Paste student records below or upload a CSV file. Each row should follow the format:{' '}
                    <code>StudentID, Student Name, Year</code>.
                  </p>
                  <div className="bulk-quick-actions">
                    <button type="button" className="btn-link" onClick={loadSampleBulk}>
                      <FileText size={14} /> Insert Sample Template
                    </button>
                    <label className="btn-link upload-label">
                      <UploadCloud size={14} /> Upload CSV
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.txt"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <textarea
                    id="bulk-students-textarea"
                    className="form-textarea"
                    rows={6}
                    placeholder="23IT001, Vigneshwaran K, 1st Year&#10;23IT002, Sneha Ramesh, 1st Year&#10;22CS014, Rahul Sundaram, 2nd Year"
                    value={bulkText}
                    onChange={handleBulkTextChange}
                  />
                </div>

                {/* Live Parse Preview */}
                {bulkParsed.length > 0 && (
                  <div className="bulk-preview-wrap">
                    <div className="bulk-preview-header">
                      <span className="preview-title">Parsed Records:</span>
                      <span className="preview-valid-count">
                        {bulkParsed.filter((s) => s.isValid && !s.isDuplicate).length} Unique
                      </span>
                      {bulkParsed.some((s) => s.isDuplicate) && (
                        <span className="preview-dup-count">
                          {bulkParsed.filter((s) => s.isDuplicate).length} Duplicate(s)
                        </span>
                      )}
                      {bulkParsed.some((s) => !s.isValid) && (
                        <span className="preview-invalid-count">
                          {bulkParsed.filter((s) => !s.isValid).length} Invalid
                        </span>
                      )}
                    </div>
                    <div className="bulk-preview-list">
                      {bulkParsed.map((item, idx) => (
                        <div
                          key={idx}
                          className={`bulk-preview-row ${
                            !item.isValid
                              ? 'bulk-preview-row--invalid'
                              : item.isDuplicate
                              ? 'bulk-preview-row--duplicate'
                              : 'bulk-preview-row--valid'
                          }`}
                        >
                          <span className="row-num">#{item.lineNum}</span>
                          <span className="row-id">{item.student_id || '—'}</span>
                          <span className="row-name">{item.name || '—'}</span>
                          <span className="row-year">{item.displayYear || item.year}</span>
                          {!item.isValid ? (
                            <span className="row-err">{item.error}</span>
                          ) : item.isDuplicate ? (
                            <span className="row-dup">Duplicate in roster</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modal Actions */}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={handleCloseAddModal}
                    disabled={bulkSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-submit-primary"
                    onClick={handleBulkSubmit}
                    disabled={bulkSubmitting || bulkParsed.filter((s) => s.isValid).length === 0}
                  >
                    {bulkSubmitting ? (
                      <>
                        <RefreshCw size={16} className="spin-animation" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Check size={16} /> Import{' '}
                        {bulkParsed.filter((s) => s.isValid).length} Students
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Duplicate Confirmation Modal ────────────────────────────── */}
      {duplicateConfirmModal && (
        <div
          className="modal-overlay modal-overlay--alert"
          style={{ zIndex: 9999 }}
          onClick={() => !bulkSubmitting && handleCancelDuplicateModal()}
        >
          <div className="modal-dialog modal-dialog--sm modal-dialog--alert" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header__title">
                <h2>Duplicate Student IDs Detected</h2>
                <p>
                  {duplicateConfirmModal.duplicates.length} duplicate record(s) found in roster
                </p>
              </div>
              <button
                className="modal-close-btn"
                onClick={handleCancelDuplicateModal}
                disabled={bulkSubmitting}
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            <div className="delete-modal-body" style={{ textAlign: 'center', padding: '20px' }}>
              <div className="delete-warning-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                <AlertTriangle size={28} />
              </div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', margin: '4px 0' }}>
                Are you sure you want to remove/skip these duplicate student IDs?
              </p>
              <p className="delete-subtext" style={{ fontSize: '13px', color: '#64748b', margin: '0 0 10px 0' }}>
                Found <strong>{duplicateConfirmModal.duplicates.length}</strong> record(s) with student IDs already registered in the system.
                Clicking <strong>Agree</strong> will skip them and import only the remaining{' '}
                <strong>{duplicateConfirmModal.uniqueStudents.length}</strong> unique student(s).
              </p>

              {/* Scrollable list of duplicate student IDs */}
              <div style={{
                maxHeight: '120px',
                overflowY: 'auto',
                width: '100%',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 10px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                justifyContent: 'center',
                boxSizing: 'border-box'
              }}>
                {duplicateConfirmModal.duplicates.map((item, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: '#fee2e2',
                      color: '#b91c1c',
                      fontSize: '11.5px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      border: '1px solid #fecaca'
                    }}
                  >
                    {item.student_id} {item.student_name || item.name ? `(${item.student_name || item.name})` : ''}
                  </span>
                ))}
              </div>

              {/* Summary Metrics */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                background: '#f1f5f9',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#475569',
                boxSizing: 'border-box'
              }}>
                <span>Total in CSV: <strong>{duplicateConfirmModal.totalCount}</strong></span>
                <span style={{ color: '#b91c1c' }}>Duplicates: <strong>{duplicateConfirmModal.duplicates.length}</strong></span>
                <span style={{ color: '#15803d' }}>Unique: <strong>{duplicateConfirmModal.uniqueStudents.length}</strong></span>
              </div>
            </div>

            <div className="modal-actions" style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={handleCancelDuplicateModal}
                disabled={bulkSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-submit-primary"
                onClick={handleAgreeSkipDuplicates}
                disabled={bulkSubmitting}
              >
                {bulkSubmitting ? (
                  <>
                    <RefreshCw size={16} className="spin-animation" />
                    Importing Unique...
                  </>
                ) : (
                  <>
                    <Check size={16} /> Agree
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. Delete Confirmation Modal ────────────────────────────── */}
      {studentToDelete && (
        <div className="modal-overlay" onClick={() => !deleting && setStudentToDelete(null)}>
          <div className="modal-dialog modal-dialog--sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header__title">
                <h2>Delete Student Record</h2>
                <p>Confirm student removal from transport system</p>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setStudentToDelete(null)}
                disabled={deleting}
              >
                <X size={20} />
              </button>
            </div>

            <div className="delete-modal-body">
              <div className="delete-warning-icon">
                <Trash2 size={28} color="#e53e3e" />
              </div>
              <p>
                Are you sure you want to delete <strong>{studentToDelete.student_name || studentToDelete.name}</strong> (
                <code>{studentToDelete.student_id}</code>)?
              </p>
              <p className="delete-subtext">
                This action will remove their pre-loaded record from the database.
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setStudentToDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger-confirm"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 7. Floating Toast Alerts ────────────────────────────────── */}
      {toast && (
        <div className={`floating-toast floating-toast--${toast.type}`}>
          {toast.type === 'success' && <CheckCircle2 size={18} />}
          {toast.type === 'warning' && <AlertTriangle size={18} />}
          {toast.type === 'error' && <AlertTriangle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default function StudentsPage() {
  return (
    <ErrorBoundary>
      <StudentsPageContent />
    </ErrorBoundary>
  );
}

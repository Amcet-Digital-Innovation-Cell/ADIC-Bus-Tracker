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
  Edit2,
  Eye,
  Phone,
  Mail,
  User,
  Shield,
  Route as RouteIcon,
  Building,
  Calendar,
  Save,
  Bus,
  AlertCircle,
  XCircle,
  Download,
} from 'lucide-react';
import { studentService, ACADEMIC_YEARS, mapYearToDb, mapDbToDisplayYear } from '../lib/studentService';
import apiClient from '../lib/apiClient';
import ErrorBoundary from '../components/ErrorBoundary';
import './Students.css';

function StudentsPageContent() {
  // ── Main Data & Loading States ──────────────────────────────────────────
  const [students, setStudents] = useState([]);
  const [availableRoutes, setAvailableRoutes] = useState([]);
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

  // ── View & Edit Student States ──────────────────────────────────────────
  const [studentToView, setStudentToView] = useState(null);
  const [studentToEdit, setStudentToEdit] = useState(null);
  const [editForm, setEditForm] = useState({
    student_id: '',
    student_name: '',
    academic_year: '1st Year',
    department: '',
    student_mobile: '',
    email: '',
    parent_name: '',
    parent_phone: '',
    route_name: '',
  });
  const [editErrors, setEditErrors] = useState({});
  const [editSubmitting, setEditSubmitting] = useState(false);

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
  const [bulkFilter, setBulkFilter] = useState('all'); // 'all' | 'ready' | 'duplicates' | 'errors'
  const [autoSkipDuplicates, setAutoSkipDuplicates] = useState(true);
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
    setBulkFilter('all');
    setAutoSkipDuplicates(true);
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
      const [data, routesRes] = await Promise.allSettled([
        studentService.fetchStudents(),
        apiClient.get('/api/routes')
      ]);

      if (data.status === 'fulfilled') {
        setStudents(Array.isArray(data.value) ? data.value : []);
      } else {
        throw data.reason;
      }

      if (routesRes.status === 'fulfilled') {
        const rList = Array.isArray(routesRes.value)
          ? routesRes.value
          : Array.isArray(routesRes.value?.routes)
          ? routesRes.value.routes
          : Array.isArray(routesRes.value?.data)
          ? routesRes.value.data
          : [];
        setAvailableRoutes(rList);
      }

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
    loadStudents();
  }, [loadStudents]);

  // ── Filter & Search Logic ──────────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    if (!Array.isArray(students)) return [];
    return students.filter((std) => {
      if (!std) return false;

      // Search by ID, Name, Department, or Email
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchesId = (std.student_id || '').toLowerCase().includes(q);
        const matchesName = (std.student_name || std.name || '').toLowerCase().includes(q);
        const matchesDept = (std.department || '').toLowerCase().includes(q);
        const matchesEmail = (std.email || '').toLowerCase().includes(q);
        const matchesRoute = (std.route_name || '').toLowerCase().includes(q);
        if (!matchesId && !matchesName && !matchesDept && !matchesEmail && !matchesRoute) return false;
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
  const handleSingleIdChange = (e) => {
    const val = e.target.value;
    setSingleForm((prev) => ({ ...prev, student_id: val }));
    const cleanId = val.trim().toUpperCase();
    if (!cleanId) {
      setSingleErrors((prev) => ({ ...prev, student_id: '' }));
      return;
    }
    const dup = students.find(
      (s) => String(s.student_id || '').trim().toUpperCase() === cleanId
    );
    if (dup) {
      setSingleErrors((prev) => ({
        ...prev,
        student_id: `Student ID "${cleanId}" is already registered (${dup.student_name || 'Roster record'})`,
      }));
    } else {
      setSingleErrors((prev) => ({ ...prev, student_id: '' }));
    }
  };

  const validateSingleForm = () => {
    const errors = {};
    const cleanId = singleForm.student_id.trim().toUpperCase();
    if (!cleanId) {
      errors.student_id = 'Student ID (Roll / Reg. No) is required';
    } else {
      const existingMatch = students.find(
        (s) => String(s.student_id || '').trim().toUpperCase() === cleanId
      );
      if (existingMatch) {
        errors.student_id = `Student ID "${cleanId}" is already registered in the system (${existingMatch.student_name || 'Roster record'})`;
      }
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
      const cleanId = singleForm.student_id.trim().toUpperCase();
      const cleanName = singleForm.student_name.trim();
      const mappedDbYear = mapYearToDb(singleForm.year);

      const added = await studentService.addStudent({
        student_id: cleanId,
        student_name: cleanName,
        year: mappedDbYear,
        academic_year: mappedDbYear,
      });

      setStudents((prev) => [added, ...prev]);
      showToast(`Student ${added.student_name || cleanName} added successfully!`, 'success');
      handleCloseAddModal();
    } catch (err) {
      console.error('[StudentsPage] Add student error:', err);
      const errMsg = err?.response?.data?.message || err?.message || 'Failed to add student';
      if (
        errMsg.toLowerCase().includes('already exists') ||
        errMsg.toLowerCase().includes('duplicate') ||
        errMsg.toLowerCase().includes('conflict')
      ) {
        setSingleErrors((prev) => ({
          ...prev,
          student_id: errMsg,
        }));
      }
      showToast(errMsg, 'error');
    } finally {
      setSingleSubmitting(false);
    }
  };

  // ── Edit Student Handlers ──────────────────────────────────────────────
  const handleOpenEditModal = (std) => {
    setStudentToEdit(std);
    setEditForm({
      student_id: std.student_id || '',
      student_name: std.student_name || std.name || '',
      academic_year: std.year || std.academic_year || '1st Year',
      department: std.department || '',
      student_mobile: std.student_mobile || '',
      email: std.email || '',
      parent_name: std.parent_name || '',
      parent_phone: std.parent_phone || '',
      route_name: std.route_name || '',
    });
    setEditErrors({});
  };

  const handleCloseEditModal = () => {
    if (editSubmitting) return;
    setStudentToEdit(null);
    setEditErrors({});
  };

  const validateEditForm = () => {
    const errors = {};
    const cleanId = String(editForm.student_id || '').trim();
    const cleanName = String(editForm.student_name || '').trim();

    if (!cleanId) {
      errors.student_id = 'Student ID is required';
    }
    if (!cleanName) {
      errors.student_name = 'Student Name is required';
    }
    if (editForm.email && !editForm.email.includes('@')) {
      errors.email = 'Please enter a valid email address';
    }

    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!validateEditForm()) return;

    setEditSubmitting(true);
    try {
      const targetId = studentToEdit.id || studentToEdit.student_id;
      const updated = await studentService.updateStudent(targetId, editForm);

      // Update state in local student list
      setStudents((prev) =>
        prev.map((s) => ((s.id && s.id === updated.id) || s.student_id === updated.student_id ? updated : s))
      );

      // If viewing this student in View modal, update view as well
      if (studentToView && (studentToView.id === updated.id || studentToView.student_id === updated.student_id)) {
        setStudentToView(updated);
      }

      showToast(`Student ${updated.student_name} updated successfully!`, 'success');
      setStudentToEdit(null);
    } catch (err) {
      console.error('[StudentsPage] Update student error:', err);
      const errMsg = err?.response?.data?.message || err?.message || 'Failed to update student';
      setEditErrors({ general: errMsg });
      showToast(errMsg, 'error');
    } finally {
      setEditSubmitting(false);
    }
  };

  // ── Bulk Entry CSV Parser ──────────────────────────────────────────────
  const parseBulkInput = (rawText) => {
    if (!rawText || !rawText.trim()) {
      setBulkParsed([]);
      return;
    }

    const lines = rawText.split(/\r?\n/);
    const parsed = [];
    const seenBatchIds = new Map(); // cleanId -> firstSeenLineNumber

    // Build lookup for already registered students in DB roster
    const rosterMap = new Map();
    (students || []).forEach((s) => {
      const idKey = String(s.student_id || '').trim().toUpperCase();
      if (idKey) rosterMap.set(idKey, s);
    });

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();
      if (!trimmed) return;

      // Detect and gracefully ignore standard header line
      const lower = trimmed.toLowerCase();
      if (
        index === 0 &&
        (lower.includes('student_id') ||
          lower.includes('student id') ||
          lower.includes('reg no') ||
          lower.includes('roll no') ||
          lower.includes('register number'))
      ) {
        return;
      }

      // Split by comma, tab, or semicolon, stripping outer quotes
      const parts = trimmed
        .split(/[,;\t]+/)
        .map((p) => p.trim().replace(/^["']|["']$/g, ''));

      const rawId = parts[0] || '';
      const rawName = parts[1] || '';
      const rawYear = parts[2] || '1st Year';
      const cleanId = rawId.trim().toUpperCase();
      const cleanName = rawName.trim();
      const displayYear = mapDbToDisplayYear(rawYear);

      let isValid = true;
      let statusType = 'ready'; // 'ready' | 'dup_file' | 'dup_db' | 'invalid'
      let error = '';

      if (!cleanId) {
        isValid = false;
        statusType = 'invalid';
        error = 'Missing Student ID';
      } else if (!cleanName) {
        isValid = false;
        statusType = 'invalid';
        error = 'Missing Student Name';
      } else if (seenBatchIds.has(cleanId)) {
        // In-CSV duplicate
        const firstLine = seenBatchIds.get(cleanId);
        isValid = false;
        statusType = 'dup_file';
        error = `Duplicate in CSV (Same as Line #${firstLine})`;
      } else if (rosterMap.has(cleanId)) {
        // Already registered in DB roster
        const existingStd = rosterMap.get(cleanId);
        isValid = false;
        statusType = 'dup_db';
        error = `Already registered (${existingStd.student_name || 'Roster record'})`;
      } else {
        // Unique and valid!
        seenBatchIds.set(cleanId, lineNum);
        statusType = 'ready';
        isValid = true;
      }

      parsed.push({
        line: lineNum,
        student_id: cleanId,
        student_name: cleanName,
        name: cleanName,
        year: displayYear,
        isValid: isValid && statusType === 'ready',
        statusType,
        error,
        existingRecord: rosterMap.get(cleanId) || null,
      });
    });

    setBulkParsed(parsed);
  };

  const bulkStats = useMemo(() => {
    const total = bulkParsed.length;
    const ready = bulkParsed.filter((s) => s.statusType === 'ready');
    const dupFile = bulkParsed.filter((s) => s.statusType === 'dup_file');
    const dupDb = bulkParsed.filter((s) => s.statusType === 'dup_db');
    const errors = bulkParsed.filter((s) => s.statusType === 'invalid');
    const totalDuplicates = dupFile.length + dupDb.length;

    return {
      total,
      readyCount: ready.length,
      readyStudents: ready,
      dupFileCount: dupFile.length,
      dupDbCount: dupDb.length,
      totalDuplicates,
      duplicateRecords: [...dupFile, ...dupDb],
      errorCount: errors.length,
    };
  }, [bulkParsed]);

  const filteredBulkRows = useMemo(() => {
    if (bulkFilter === 'ready') {
      return bulkParsed.filter((s) => s.statusType === 'ready');
    }
    if (bulkFilter === 'duplicates') {
      return bulkParsed.filter((s) => s.statusType === 'dup_file' || s.statusType === 'dup_db');
    }
    if (bulkFilter === 'errors') {
      return bulkParsed.filter((s) => s.statusType === 'invalid');
    }
    return bulkParsed;
  }, [bulkParsed, bulkFilter]);

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
    e.target.value = '';
  };

  const loadSampleBulk = () => {
    const sample = `StudentID, Full Name, Academic Year\n23IT001, Vigneshwaran K, 1st Year\n23IT002, Sneha Ramesh, 1st Year\n22CS014, Rahul Sundaram, 2nd Year\n22CS015, Ananya Nair, 2nd Year\n21EC030, Karthik Raja, 3rd Year`;
    setBulkText(sample);
    parseBulkInput(sample);
  };

  const downloadSampleCsv = () => {
    const sampleContent = `StudentID, Full Name, Academic Year\n23IT001, Vigneshwaran K, 1st Year\n23IT002, Sneha Ramesh, 1st Year\n22CS014, Rahul Sundaram, 2nd Year\n22CS015, Ananya Nair, 2nd Year\n21EC030, Karthik Raja, 3rd Year\n`;
    const blob = new Blob([sampleContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'sample_students_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const executeBulkImport = async (studentsToImport, skippedDuplicatesCount = 0) => {
    setBulkSubmitting(true);
    try {
      const result = await studentService.addStudentsBulk(
        studentsToImport.map((s) => ({
          student_id: s.student_id,
          student_name: s.student_name || s.name,
          year: mapYearToDb(s.year),
          academic_year: mapYearToDb(s.year),
        })),
        { skipDuplicates: true }
      );

      const importedCount = result?.successCount ?? studentsToImport.length;
      if (skippedDuplicatesCount > 0) {
        showToast(
          `Imported ${importedCount} unique student(s) successfully! (${skippedDuplicatesCount} duplicate(s) skipped)`,
          'success'
        );
      } else {
        showToast(`Imported ${importedCount} student(s) successfully!`, 'success');
      }

      await loadStudents();
      handleCloseAddModal();
    } catch (err) {
      console.error('[StudentsPage] Bulk import error:', err);
      showToast(err?.response?.data?.message || err?.message || 'Failed to import students', 'error');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleBulkSubmit = async () => {
    if (bulkParsed.length === 0) {
      showToast('Please enter or upload student data first', 'warning');
      return;
    }

    const { readyStudents, readyCount, totalDuplicates, duplicateRecords } = bulkStats;

    if (readyCount === 0) {
      if (totalDuplicates > 0) {
        showToast(
          `All ${bulkParsed.length} records in this CSV already exist in the database or are duplicate. 0 new students to import.`,
          'warning'
        );
      } else {
        showToast('No valid student records found to import. Please check for errors.', 'error');
      }
      return;
    }

    // If autoSkipDuplicates is enabled (recommended) or there are no duplicates at all
    if (autoSkipDuplicates || totalDuplicates === 0) {
      await executeBulkImport(readyStudents, totalDuplicates);
      return;
    }

    // If autoSkipDuplicates is turned off and duplicates exist, open confirmation modal
    setIsAddModalOpen(false);
    setDuplicateConfirmModal({
      duplicates: duplicateRecords,
      uniqueStudents: readyStudents,
      totalCount: bulkParsed.length,
    });
  };

  const handleCancelDuplicateModal = () => {
    setDuplicateConfirmModal(null);
    setIsAddModalOpen(true);
  };

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
      showToast(`Student ${studentToDelete.name || studentToDelete.student_name} removed successfully`, 'warning');
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
            Pre-loaded student database and app registration status for AMCET Transport
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
            placeholder="Search by ID, Name, Dept, Email, or Route..."
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
                  <th style={{ width: '16%' }}>Student ID</th>
                  <th style={{ width: '28%' }}>Student Profile</th>
                  <th style={{ width: '12%' }}>Year</th>
                  <th style={{ width: '18%' }}>Assigned Route</th>
                  <th style={{ width: '14%' }}>Status</th>
                  <th style={{ width: '12%', textAlign: 'center' }}>Action</th>
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
                    <tr
                      key={std.id || std.student_id}
                      className="student-table-row"
                      onClick={() => setStudentToView(std)}
                      title="Click row to view complete profile details"
                    >
                      {/* 1. Student ID */}
                      <td>
                        <span className="student-id-badge" title="ID Card Number">
                          {std.student_id}
                        </span>
                      </td>

                      {/* 2. Student Name & Meta */}
                      <td>
                        <div className="student-name-cell">
                          <div className="student-avatar" aria-hidden="true">
                            {getInitials(std.student_name || std.name)}
                          </div>
                          <div className="student-name-meta">
                            <span className="student-name-text">{std.student_name || std.name}</span>
                            <div className="student-submeta-row">
                              {std.department && (
                                <span className="student-dept-subtext">{std.department}</span>
                              )}
                              {std.student_mobile && (
                                <span className="student-phone-subtext">
                                  <Phone size={10} /> {std.student_mobile}
                                </span>
                              )}
                            </div>
                            {std.email && (
                              <span className="student-email-subtext">
                                <Mail size={10} /> {std.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 3. Year */}
                      <td>
                        <span className="year-pill">{std.year}</span>
                      </td>

                      {/* 4. Assigned Route */}
                      <td>
                        {std.route_name ? (
                          <div className="student-route-cell">
                            <span className="student-route-tag" title={`Assigned Route: ${std.route_name}`}>
                              <RouteIcon size={12} />
                              <span>{std.route_name}</span>
                            </span>
                            {std.bus_number && (
                              <span className="student-bus-tag">
                                <Bus size={10} /> Bus {std.bus_number}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="student-no-route">— None —</span>
                        )}
                      </td>

                      {/* 5. Registration Status */}
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

                      {/* 6. Actions */}
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <div className="student-actions-cluster">
                          {/* View Full Profile button */}
                          <button
                            type="button"
                            className="btn-action-icon btn-action-view"
                            onClick={() => setStudentToView(std)}
                            title={`View full details of ${std.student_name || std.name}`}
                            aria-label={`View details of ${std.student_name || std.name}`}
                          >
                            <Eye size={15} />
                          </button>

                          {/* Edit button */}
                          <button
                            type="button"
                            className="btn-action-icon btn-action-edit"
                            onClick={() => handleOpenEditModal(std)}
                            title={`Edit student ${std.student_name || std.name}`}
                            aria-label={`Edit student ${std.student_name || std.name}`}
                          >
                            <Edit2 size={15} />
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            className="btn-action-icon btn-action-delete"
                            onClick={() => setStudentToDelete(std)}
                            title={`Delete ${std.student_name || std.name}`}
                            aria-label={`Delete student ${std.student_name || std.name}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
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

      {/* ── 5. View Student Details Modal ───────────────────────────── */}
      {studentToView && (
        <div className="modal-overlay" onClick={() => setStudentToView(null)}>
          <div className="modal-dialog modal-dialog--profile" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header__title">
                <h2>Student Profile Details</h2>
                <p>Complete registered profile and transport record</p>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setStudentToView(null)}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="view-profile-body">
              {/* Profile Hero Card */}
              <div className="profile-hero-card">
                <div className="profile-hero-avatar">
                  {getInitials(studentToView.student_name || studentToView.name)}
                </div>
                <div className="profile-hero-info">
                  <h3 className="profile-hero-name">
                    {studentToView.student_name || studentToView.name}
                  </h3>
                  <div className="profile-hero-tags">
                    <span className="profile-hero-id">ID: {studentToView.student_id}</span>
                    <span className="profile-hero-year">{studentToView.year}</span>
                    {Boolean(
                      studentToView.is_registered ||
                      studentToView.registration_status === 'Registered' ||
                      (studentToView.email && studentToView.email.includes('@'))
                    ) ? (
                      <span className="status-badge status-badge--registered">
                        <CheckCircle2 size={12} strokeWidth={2.5} /> Registered
                      </span>
                    ) : (
                      <span className="status-badge status-badge--pending">
                        <Clock size={12} strokeWidth={2.5} /> Not Registered
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Profile Details Grid */}
              <div className="profile-details-grid">
                {/* 1. Student ID */}
                <div className="profile-detail-card">
                  <div className="detail-card-label">
                    <GraduationCap size={14} className="detail-card-icon" />
                    <span>Student ID</span>
                  </div>
                  <div className="detail-card-value font-mono">
                    {studentToView.student_id || '—'}
                  </div>
                </div>

                {/* 2. Full Name */}
                <div className="profile-detail-card">
                  <div className="detail-card-label">
                    <User size={14} className="detail-card-icon" />
                    <span>Full Name</span>
                  </div>
                  <div className="detail-card-value">
                    {studentToView.student_name || studentToView.name || '—'}
                  </div>
                </div>

                {/* 3. Academic Year */}
                <div className="profile-detail-card">
                  <div className="detail-card-label">
                    <Calendar size={14} className="detail-card-icon" />
                    <span>Academic Year</span>
                  </div>
                  <div className="detail-card-value">
                    {studentToView.year || studentToView.academic_year || '—'}
                  </div>
                </div>

                {/* 4. Department */}
                <div className="profile-detail-card">
                  <div className="detail-card-label">
                    <Building size={14} className="detail-card-icon" />
                    <span>Department</span>
                  </div>
                  <div className="detail-card-value">
                    {studentToView.department || 'Not specified'}
                  </div>
                </div>

                {/* 5. Mobile Number */}
                <div className="profile-detail-card">
                  <div className="detail-card-label">
                    <Phone size={14} className="detail-card-icon" />
                    <span>Mobile Number</span>
                  </div>
                  <div className="detail-card-value">
                    {studentToView.student_mobile ? (
                      <a href={`tel:${studentToView.student_mobile}`} className="detail-link">
                        {studentToView.student_mobile}
                      </a>
                    ) : (
                      <span className="text-muted">Not registered</span>
                    )}
                  </div>
                </div>

                {/* 6. Email */}
                <div className="profile-detail-card">
                  <div className="detail-card-label">
                    <Mail size={14} className="detail-card-icon" />
                    <span>Email Address</span>
                  </div>
                  <div className="detail-card-value">
                    {studentToView.email ? (
                      <a href={`mailto:${studentToView.email}`} className="detail-link">
                        {studentToView.email}
                      </a>
                    ) : (
                      <span className="text-muted">Not registered</span>
                    )}
                  </div>
                </div>

                {/* 7. Parent Name */}
                <div className="profile-detail-card">
                  <div className="detail-card-label">
                    <Shield size={14} className="detail-card-icon" />
                    <span>Parent / Guardian Name</span>
                  </div>
                  <div className="detail-card-value">
                    {studentToView.parent_name || 'Not provided'}
                  </div>
                </div>

                {/* 8. Parent Phone */}
                <div className="profile-detail-card">
                  <div className="detail-card-label">
                    <Phone size={14} className="detail-card-icon" />
                    <span>Parent Phone</span>
                  </div>
                  <div className="detail-card-value">
                    {studentToView.parent_phone ? (
                      <a href={`tel:${studentToView.parent_phone}`} className="detail-link">
                        {studentToView.parent_phone}
                      </a>
                    ) : (
                      <span className="text-muted">Not provided</span>
                    )}
                  </div>
                </div>

                {/* 9. Assigned Route Name */}
                <div className="profile-detail-card profile-detail-card--wide">
                  <div className="detail-card-label">
                    <RouteIcon size={14} className="detail-card-icon" />
                    <span>Assigned Route & Transport</span>
                  </div>
                  <div className="detail-card-value detail-card-value--route">
                    {studentToView.route_name ? (
                      <div className="route-detail-group">
                        <span className="route-name-highlight">
                          {studentToView.route_name}
                        </span>
                        {studentToView.bus_number && (
                          <span className="bus-number-highlight">
                            <Bus size={12} /> Bus {studentToView.bus_number}
                          </span>
                        )}
                        {studentToView.boarding_stop && (
                          <span className="stop-name-highlight">
                            Boarding: {studentToView.boarding_stop}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted">No route assigned yet</span>
                    )}
                  </div>
                </div>

                {/* Activation Key (if available) */}
                {studentToView.activation_key && (
                  <div className="profile-detail-card profile-detail-card--wide">
                    <div className="detail-card-label">
                      <CheckCircle2 size={14} className="detail-card-icon" />
                      <span>App Activation Key</span>
                    </div>
                    <div className="detail-card-value">
                      <code className="activation-key-large">
                        {studentToView.activation_key}
                      </code>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-actions" style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStudentToView(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-submit-primary"
                onClick={() => {
                  const target = studentToView;
                  setStudentToView(null);
                  handleOpenEditModal(target);
                }}
              >
                <Edit2 size={16} /> Edit Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. Edit Student Modal ───────────────────────────────────── */}
      {studentToEdit && (
        <div className="modal-overlay" onClick={handleCloseEditModal}>
          <div className="modal-dialog modal-dialog--md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header__title">
                <h2>Edit Student Profile</h2>
                <p>Modify student records and transport assignment</p>
              </div>
              <button
                className="modal-close-btn"
                onClick={handleCloseEditModal}
                disabled={editSubmitting}
                aria-label="Close edit modal"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="student-edit-form">
              <div className="edit-form-body">
                {editErrors.general && (
                  <div className="form-error-banner">
                    <AlertTriangle size={16} />
                    <span>{editErrors.general}</span>
                  </div>
                )}

                <div className="form-grid-2col">
                  {/* 1. Student ID */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-student-id">
                      Student ID <span className="req">*</span>
                    </label>
                    <input
                      id="edit-student-id"
                      type="text"
                      className={`form-input ${editErrors.student_id ? 'form-input--error' : ''}`}
                      value={editForm.student_id}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, student_id: e.target.value }))}
                      placeholder="e.g. 23IT001 or F26GQAD376"
                      disabled={editSubmitting}
                    />
                    {editErrors.student_id && (
                      <span className="field-error">{editErrors.student_id}</span>
                    )}
                  </div>

                  {/* 2. Full Name */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-student-name">
                      Full Name <span className="req">*</span>
                    </label>
                    <input
                      id="edit-student-name"
                      type="text"
                      className={`form-input ${editErrors.student_name ? 'form-input--error' : ''}`}
                      value={editForm.student_name}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, student_name: e.target.value }))}
                      placeholder="e.g. Anandhi B"
                      disabled={editSubmitting}
                    />
                    {editErrors.student_name && (
                      <span className="field-error">{editErrors.student_name}</span>
                    )}
                  </div>

                  {/* 3. Academic Year */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-academic-year">
                      Academic Year <span className="req">*</span>
                    </label>
                    <select
                      id="edit-academic-year"
                      className="form-select"
                      value={editForm.academic_year}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, academic_year: e.target.value }))}
                      disabled={editSubmitting}
                    >
                      {ACADEMIC_YEARS.map((yr) => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 4. Department */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-department">
                      Department
                    </label>
                    <input
                      id="edit-department"
                      type="text"
                      className="form-input"
                      value={editForm.department}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, department: e.target.value }))}
                      placeholder="e.g. Computer Science & Engineering"
                      disabled={editSubmitting}
                    />
                  </div>

                  {/* 5. Mobile Number */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-student-mobile">
                      Student Mobile Number
                    </label>
                    <input
                      id="edit-student-mobile"
                      type="tel"
                      className="form-input"
                      value={editForm.student_mobile}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, student_mobile: e.target.value }))}
                      placeholder="e.g. 9876543210"
                      disabled={editSubmitting}
                    />
                  </div>

                  {/* 6. Email */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-student-email">
                      Student Email Address
                    </label>
                    <input
                      id="edit-student-email"
                      type="email"
                      className={`form-input ${editErrors.email ? 'form-input--error' : ''}`}
                      value={editForm.email}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="e.g. student@amcet.in"
                      disabled={editSubmitting}
                    />
                    {editErrors.email && (
                      <span className="field-error">{editErrors.email}</span>
                    )}
                  </div>

                  {/* 7. Parent Name */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-parent-name">
                      Parent / Guardian Name
                    </label>
                    <input
                      id="edit-parent-name"
                      type="text"
                      className="form-input"
                      value={editForm.parent_name}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, parent_name: e.target.value }))}
                      placeholder="e.g. Balakrishnan M"
                      disabled={editSubmitting}
                    />
                  </div>

                  {/* 8. Parent Phone */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-parent-phone">
                      Parent Phone Number
                    </label>
                    <input
                      id="edit-parent-phone"
                      type="tel"
                      className="form-input"
                      value={editForm.parent_phone}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, parent_phone: e.target.value }))}
                      placeholder="e.g. 9842012345"
                      disabled={editSubmitting}
                    />
                  </div>
                </div>

                {/* 9. Assigned Route Name */}
                <div className="form-group" style={{ marginTop: '6px' }}>
                  <label className="form-label" htmlFor="edit-route-name">
                    Assigned Route Name
                  </label>
                  <div className="route-select-wrapper">
                    <input
                      id="edit-route-name"
                      type="text"
                      list="available-routes-datalist"
                      className="form-input"
                      value={editForm.route_name}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, route_name: e.target.value }))}
                      placeholder="Select or enter route name (e.g. POLLACHI TO AMCET)"
                      disabled={editSubmitting}
                    />
                    <datalist id="available-routes-datalist">
                      {availableRoutes.map((r) => (
                        <option key={r.id || r.route_name} value={r.route_name}>
                          {r.route_name} {r.origin ? `(${r.origin} → ${r.destination || ''})` : ''}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <span className="form-hint">
                    Choose from available transport routes or enter an assigned route name.
                  </span>
                </div>
              </div>

              <div className="modal-actions" style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={handleCloseEditModal}
                  disabled={editSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit-primary"
                  disabled={editSubmitting}
                >
                  {editSubmitting ? (
                    <>
                      <RefreshCw size={16} className="spin-animation" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} /> Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 7. Add Student Modal (Manual & Bulk Entry) ──────────────── */}
      {isAddModalOpen && !duplicateConfirmModal && (
        <div className="modal-overlay" onClick={handleCloseAddModal}>
          <div className="modal-dialog modal-dialog--md" onClick={(e) => e.stopPropagation()}>
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

            <div className="modal-tabs">
              <button
                className={`modal-tab-btn ${activeTab === 'single' ? 'modal-tab-btn--active' : ''}`}
                onClick={() => setActiveTab('single')}
                type="button"
              >
                <User size={15} />
                <span>Single Entry</span>
              </button>
              <button
                className={`modal-tab-btn ${activeTab === 'bulk' ? 'modal-tab-btn--active' : ''}`}
                onClick={() => setActiveTab('bulk')}
                type="button"
              >
                <UploadCloud size={15} />
                <span>Bulk Import (CSV / Text)</span>
              </button>
            </div>

            {activeTab === 'single' ? (
              <form onSubmit={handleSingleSubmit} className="single-student-form">
                <div className="form-group">
                  <label className="form-label" htmlFor="single-student-id">
                    Student ID <span className="req">*</span>
                  </label>
                  <input
                    id="single-student-id"
                    type="text"
                    className={`form-input ${singleErrors.student_id ? 'form-input--error' : ''}`}
                    placeholder="e.g. 23IT001 or 7376222IT101"
                    value={singleForm.student_id}
                    onChange={handleSingleIdChange}
                    disabled={singleSubmitting}
                  />
                  {singleErrors.student_id ? (
                    <span className="field-error">
                      <AlertTriangle size={13} />
                      {singleErrors.student_id}
                    </span>
                  ) : (
                    <span className="field-hint">
                      Standard College ID card number (Roll / Register number)
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="single-student-name">
                    Student Full Name <span className="req">*</span>
                  </label>
                  <input
                    id="single-student-name"
                    type="text"
                    className={`form-input ${singleErrors.student_name ? 'form-input--error' : ''}`}
                    placeholder="e.g. Vigneshwaran K"
                    value={singleForm.student_name}
                    onChange={(e) => {
                      setSingleForm((prev) => ({ ...prev, student_name: e.target.value }));
                      if (singleErrors.student_name) {
                        setSingleErrors((prev) => ({ ...prev, student_name: '' }));
                      }
                    }}
                    disabled={singleSubmitting}
                  />
                  {singleErrors.student_name && (
                    <span className="field-error">
                      <AlertTriangle size={13} />
                      {singleErrors.student_name}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="single-student-year">
                    Academic Year <span className="req">*</span>
                  </label>
                  <select
                    id="single-student-year"
                    className="form-select"
                    value={singleForm.year}
                    onChange={(e) =>
                      setSingleForm((prev) => ({ ...prev, year: e.target.value }))
                    }
                    disabled={singleSubmitting}
                  >
                    {ACADEMIC_YEARS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>

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
                    disabled={singleSubmitting || Boolean(singleErrors.student_id)}
                  >
                    {singleSubmitting ? (
                      <>
                        <RefreshCw size={16} className="spin-animation" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Plus size={16} /> Add Student
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="bulk-import-container">
                <div className="bulk-toolbar">
                  <div className="bulk-file-btn-wrapper">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/plain"
                      id="bulk-file-input"
                      className="bulk-file-hidden"
                      onChange={handleFileUpload}
                      disabled={bulkSubmitting}
                    />
                    <label htmlFor="bulk-file-input" className="btn-file-upload">
                      <UploadCloud size={16} />
                      <span>Upload CSV File</span>
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-sample-bulk"
                      onClick={downloadSampleCsv}
                      disabled={bulkSubmitting}
                      title="Download template CSV"
                    >
                      <Download size={14} />
                      <span>Template</span>
                    </button>
                    <button
                      type="button"
                      className="btn-sample-bulk"
                      onClick={loadSampleBulk}
                      disabled={bulkSubmitting}
                    >
                      <FileText size={14} />
                      <span>Load Sample</span>
                    </button>
                  </div>
                </div>

                <div className="bulk-input-wrapper">
                  <textarea
                    id="bulk-text-input"
                    className="bulk-textarea"
                    placeholder={"Enter one student per line: StudentID, Full Name, Academic Year\n\nExample:\n23IT001, Vigneshwaran K, 1st Year\n23IT002, Sneha Ramesh, 1st Year\n22CS014, Rahul Sundaram, 2nd Year"}
                    value={bulkText}
                    onChange={handleBulkTextChange}
                    disabled={bulkSubmitting}
                    rows={5}
                  />
                  <div className="bulk-helper-note">
                    <span>Format: <code>StudentID, Full Name, Year</code></span>
                    <span>Header row is auto-detected and ignored safely</span>
                  </div>
                </div>

                {bulkParsed.length > 0 && (
                  <div className="bulk-preview-section">
                    <div className="bulk-stats-header">
                      <div className="bulk-stat-chips">
                        <span className="stat-pill stat-pill--ready">
                          <Check size={12} /> {bulkStats.readyCount} Ready
                        </span>
                        {bulkStats.dupFileCount > 0 && (
                          <span className="stat-pill stat-pill--dup-file">
                            <AlertTriangle size={12} /> {bulkStats.dupFileCount} In-CSV Duplicate
                          </span>
                        )}
                        {bulkStats.dupDbCount > 0 && (
                          <span className="stat-pill stat-pill--dup-db">
                            <AlertCircle size={12} /> {bulkStats.dupDbCount} In Roster
                          </span>
                        )}
                        {bulkStats.errorCount > 0 && (
                          <span className="stat-pill stat-pill--error">
                            <XCircle size={12} /> {bulkStats.errorCount} Error
                          </span>
                        )}
                      </div>

                      <div className="bulk-filter-buttons">
                        <button
                          type="button"
                          className={`filter-btn ${bulkFilter === 'all' ? 'filter-btn--active' : ''}`}
                          onClick={() => setBulkFilter('all')}
                        >
                          All ({bulkParsed.length})
                        </button>
                        <button
                          type="button"
                          className={`filter-btn ${bulkFilter === 'ready' ? 'filter-btn--active' : ''}`}
                          onClick={() => setBulkFilter('ready')}
                        >
                          Ready ({bulkStats.readyCount})
                        </button>
                        {bulkStats.totalDuplicates > 0 && (
                          <button
                            type="button"
                            className={`filter-btn ${bulkFilter === 'duplicates' ? 'filter-btn--active' : ''}`}
                            onClick={() => setBulkFilter('duplicates')}
                          >
                            Duplicates ({bulkStats.totalDuplicates})
                          </button>
                        )}
                        {bulkStats.errorCount > 0 && (
                          <button
                            type="button"
                            className={`filter-btn ${bulkFilter === 'errors' ? 'filter-btn--active' : ''}`}
                            onClick={() => setBulkFilter('errors')}
                          >
                            Errors ({bulkStats.errorCount})
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="bulk-preview-table-wrap">
                      <table className="bulk-preview-table">
                        <thead>
                          <tr>
                            <th style={{ width: '45px' }}>#</th>
                            <th style={{ width: '130px' }}>Student ID</th>
                            <th>Full Name</th>
                            <th style={{ width: '90px' }}>Year</th>
                            <th>Status & Validation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredBulkRows.map((row) => (
                            <tr
                              key={row.line}
                              className={
                                row.statusType === 'ready'
                                  ? 'row-ready'
                                  : row.statusType === 'dup_file'
                                  ? 'row-dup-file'
                                  : row.statusType === 'dup_db'
                                  ? 'row-dup-db'
                                  : 'row-error'
                              }
                            >
                              <td>{row.line}</td>
                              <td>
                                <code className="row-std-id">{row.student_id || '—'}</code>
                              </td>
                              <td style={{ fontWeight: 600 }}>{row.student_name || '—'}</td>
                              <td>{row.year || '—'}</td>
                              <td>
                                {row.statusType === 'ready' && (
                                  <span className="status-badge status-badge--ready">
                                    <Check size={11} /> Ready to Import
                                  </span>
                                )}
                                {row.statusType === 'dup_file' && (
                                  <span className="status-badge status-badge--dup-file">
                                    <AlertTriangle size={11} /> {row.error}
                                  </span>
                                )}
                                {row.statusType === 'dup_db' && (
                                  <span className="status-badge status-badge--dup-db">
                                    <AlertCircle size={11} /> {row.error}
                                  </span>
                                )}
                                {row.statusType === 'invalid' && (
                                  <span className="status-badge status-badge--error">
                                    <XCircle size={11} /> {row.error}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {bulkStats.totalDuplicates > 0 && (
                  <label className="bulk-skip-toggle">
                    <input
                      type="checkbox"
                      checked={autoSkipDuplicates}
                      onChange={(e) => setAutoSkipDuplicates(e.target.checked)}
                      disabled={bulkSubmitting}
                    />
                    <span>
                      Automatically skip {bulkStats.totalDuplicates} duplicate record(s) and import only unique new students
                    </span>
                  </label>
                )}

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
                    disabled={
                      bulkSubmitting ||
                      bulkParsed.length === 0 ||
                      bulkStats.readyCount === 0
                    }
                  >
                    {bulkSubmitting ? (
                      <>
                        <RefreshCw size={16} className="spin-animation" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Check size={16} /> Import{' '}
                        {bulkStats.readyCount > 0 ? bulkStats.readyCount : ''} Student
                        {bulkStats.readyCount === 1 ? '' : 's'}
                        {bulkStats.totalDuplicates > 0 && autoSkipDuplicates
                          ? ` (Skip ${bulkStats.totalDuplicates} Dups)`
                          : ''}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 8. Duplicate Confirmation Modal ────────────────────────── */}
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
                boxSizing: 'border-box',
                marginTop: '10px'
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

      {/* ── 9. Delete Confirmation Modal ────────────────────────────── */}
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

      {/* ── 10. Floating Toast Alerts ───────────────────────────────── */}
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

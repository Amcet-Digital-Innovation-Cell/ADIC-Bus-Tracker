/**
 * src/lib/studentService.js
 * ─────────────────────────────────────────────────────────────
 * Student management service for AMCET Transport Management System.
 * Connects directly to Express backend endpoints:
 *   - GET    /api/students     (Fetch all pre-loaded students)
 *   - POST   /api/students     (Add a new student / bulk students)
 *   - DELETE /api/students/:id (Remove student record)
 * ─────────────────────────────────────────────────────────────
 */

import apiClient from './apiClient';

export const ACADEMIC_YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

/**
 * Mapping from various academic year representations to database format (1.0, 2.0, 3.0, 4.0)
 */
export const YEAR_TO_DB_MAP = {
  '1st Year': '1.0',
  '2nd Year': '2.0',
  '3rd Year': '3.0',
  '4th Year': '4.0',
  '1': '1.0',
  '2': '2.0',
  '3': '3.0',
  '4': '4.0',
  'I': '1.0',
  'II': '2.0',
  'III': '3.0',
  'IV': '4.0',
  '1.0': '1.0',
  '2.0': '2.0',
  '3.0': '3.0',
  '4.0': '4.0',
};

/**
 * Map academic year input to database format (e.g., "1st Year" -> "1.0")
 */
export const mapYearToDb = (year) => {
  if (!year) return '1.0';
  const clean = String(year).trim();
  return YEAR_TO_DB_MAP[clean] || (YEAR_TO_DB_MAP[clean.toLowerCase()] || clean);
};

/**
 * Map database academic year (e.g. "1.0", "1") to standard display text ("1st Year")
 */
export const mapDbToDisplayYear = (year) => {
  if (!year) return '1st Year';
  const clean = String(year).trim();
  if (clean === '1.0' || clean === '1' || clean === 'I' || clean.toLowerCase() === '1st' || clean === '1st Year') return '1st Year';
  if (clean === '2.0' || clean === '2' || clean === 'II' || clean.toLowerCase() === '2nd' || clean === '2nd Year') return '2nd Year';
  if (clean === '3.0' || clean === '3' || clean === 'III' || clean.toLowerCase() === '3rd' || clean === '3rd Year') return '3rd Year';
  if (clean === '4.0' || clean === '4' || clean === 'IV' || clean.toLowerCase() === '4th' || clean === '4th Year') return '4th Year';
  return clean;
};

/**
 * Normalizes student payload from backend into consistent frontend model
 */
export const normalizeStudent = (raw) => {
  if (!raw) return null;

  // Determine if student is registered:
  // Evaluates is_registered (boolean or string), registration_status, activation_key, or email
  const isRegistered = Boolean(
    raw.is_registered === true ||
    raw.is_registered === 'true' ||
    raw.is_registered === 1 ||
    (typeof raw.registration_status === 'string' && raw.registration_status.toLowerCase() === 'registered') ||
    (typeof raw.activation_key === 'string' && raw.activation_key.toUpperCase().startsWith('AM-')) ||
    (Boolean(raw.email) && String(raw.email).trim().length > 0)
  );

  const registrationStatus = isRegistered ? 'Registered' : 'Not Registered';

  // Normalize year for display
  const rawYear = raw.year || raw.academic_year || '1.0';
  const displayYear = mapDbToDisplayYear(rawYear);
  const dbYear = mapYearToDb(rawYear);

  const studentId = (raw.student_id || raw.id_card_number || raw.id || '').toString().trim();
  const studentName = (raw.student_name || raw.name || raw.full_name || '').toString().trim();
  const studentMobile = (raw.student_mobile || raw.phone || '').toString().trim();

  const formatted = {
    ...raw,
    id: raw.id || raw._id || studentId,
    student_id: studentId,
    student_name: studentName,
    name: studentName,
    year: displayYear,
    academic_year: displayYear,
    db_year: dbYear,
    is_registered: isRegistered,
    registration_status: registrationStatus,
    activation_key: raw.activation_key || null,
    email: raw.email || '',
    student_mobile: studentMobile,
    department: raw.department || '',
    parent_name: raw.parent_name || '',
    parent_phone: raw.parent_phone || '',
    route_id: raw.route_id || null,
    route_name: raw.route_name || '',
    stop_id: raw.stop_id !== undefined && raw.stop_id !== null ? String(raw.stop_id) : null,
    stop_name: raw.stop_name || raw.boarding_stop || '',
    boarding_stop: raw.boarding_stop || raw.stop_name || '',
    bus_number: raw.bus_number || '',
    created_at: raw.created_at || raw.createdAt || null,
  };

  delete formatted.phone;
  delete formatted.device_status;

  return formatted;
};

export const studentService = {
  /**
   * Fetch all pre-loaded students from Express backend
   * Endpoint: GET /api/students
   * Supports higher limit queries (e.g. 5000, 10000) to ensure > 1000 records are fully fetched.
   */
  fetchStudents: async (params = {}) => {
    try {
      const limit = params?.limit || 10000;
      const res = await apiClient.get(`/api/students?limit=${limit}`);
      const rawList = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.students)
        ? res.students
        : [];

      return rawList.map(normalizeStudent).filter(Boolean);
    } catch (err) {
      console.error('[studentService] Error fetching students:', err.message);
      throw err;
    }
  },

  /**
   * Fetch stops array for a specific route from JSON column
   * Endpoint: GET /api/routes/:route_id/stops
   * @param {string|number} routeId
   * @returns {Promise<Array>}
   */
  fetchRouteStops: async (routeId) => {
    if (!routeId) return [];
    try {
      const res = await apiClient.get(`/api/routes/${encodeURIComponent(routeId)}/stops`);
      if (Array.isArray(res?.data)) return res.data;
      if (Array.isArray(res?.stops)) return res.stops;
      if (Array.isArray(res)) return res;
      return [];
    } catch (err) {
      console.error(`[studentService] Error fetching stops for route ${routeId}:`, err.message);
      throw err;
    }
  },

  /**
   * Add a new student record
   * Endpoint: POST /api/students
   * @param {Object} student - { student_id, name, year, academic_year, route_id, stop_id }
   */
  addStudent: async ({
    student_id,
    student_name,
    name,
    year,
    academic_year,
    department,
    student_mobile,
    phone,
    student_email,
    email,
    parent_name,
    parent_phone,
    route_id,
    route_name,
    stop_id,
    stop_name,
    boarding_stop,
  }) => {
    const cleanId = String(student_id || '').trim();
    const cleanName = String(student_name || name || '').trim();
    const rawYear = academic_year || year || '1st Year';
    const dbYear = mapYearToDb(rawYear);

    if (!cleanId) throw new Error('Student ID is required');
    if (!cleanName) throw new Error('Student Name is required');
    if (!dbYear) throw new Error('Academic Year is required');

    const emailValue = (student_email || email) ? String(student_email || email).trim().toLowerCase() : null;
    const phoneValue = (student_mobile || phone) ? String(student_mobile || phone).trim() : null;
    const cleanStopName = (stop_name || boarding_stop) ? String(stop_name || boarding_stop).trim() : null;

    const payload = {
      student_id: cleanId,
      student_name: cleanName,
      year: dbYear,
      academic_year: dbYear,
      department: department ? String(department).trim() : null,
      student_mobile: phoneValue,
      student_email: emailValue,
      email: emailValue,
      parent_name: parent_name ? String(parent_name).trim() : null,
      parent_phone: parent_phone ? String(parent_phone).trim() : null,
      route_id: (route_id !== undefined && route_id !== null && route_id !== '') ? parseInt(route_id, 10) : null,
      route_name: route_name ? String(route_name).trim() : null,
      stop_id: (stop_id !== undefined && stop_id !== null && stop_id !== '') ? String(stop_id).trim() : null,
      stop_name: cleanStopName,
      boarding_stop: cleanStopName,
    };

    try {
      const res = await apiClient.post('/api/students', payload);
      const createdItem = res?.student || (Array.isArray(res?.data) ? res.data[0] : res?.data) || res;
      return normalizeStudent(createdItem) || {
        ...payload,
        year: mapDbToDisplayYear(dbYear),
        academic_year: mapDbToDisplayYear(dbYear),
        registration_status: 'Not Registered'
      };
    } catch (err) {
      console.error('[studentService] Error adding student:', err.message);
      throw err;
    }
  },

  /**
   * Add multiple students in bulk
   * Attempts POST /api/students/bulk or sequential POST /api/students
   * @param {Array<{ student_id, name, year }>} students
   */
  addStudentsBulk: async (students, options = {}) => {
    if (!Array.isArray(students) || students.length === 0) {
      throw new Error('No students provided for bulk insertion');
    }

    const formattedPayload = students.map((s) => {
      const dbYear = mapYearToDb(s.year || s.academic_year);
      return {
        student_id: String(s.student_id || '').trim().toUpperCase(),
        student_name: String(s.student_name || s.name || '').trim(),
        year: dbYear,
        academic_year: dbYear,
      };
    });

    // Attempt bulk API endpoint with deduplication support
    try {
      const res = await apiClient.post('/api/students/bulk', {
        students: formattedPayload,
        skip_duplicates: options.skipDuplicates !== false,
      });

      return {
        successCount: res?.count ?? (Array.isArray(res?.students) ? res.students.length : formattedPayload.length),
        skippedCount: res?.skippedDuplicatesCount || 0,
        duplicates: res?.existingDuplicates || [],
        inBatchDuplicates: res?.inBatchDuplicates || [],
        res,
      };
    } catch (err) {
      console.error('[studentService] Error adding students in bulk:', err.message);
      throw err;
    }
  },

  /**
   * Delete a student record by database ID or student_id
   * Endpoint: DELETE /api/students/:id
   * @param {string|number} id
   */
  /**
   * Update student details
   * Endpoint: PUT /api/students/:id
   * @param {string|number} id - Student ID or DB ID
   * @param {Object} studentData
   */
  updateStudent: async (id, studentData) => {
    if (!id) throw new Error('Student ID is required for update');

    try {
      const res = await apiClient.put('/api/students/' + encodeURIComponent(id), studentData);
      const updated = res?.student || (Array.isArray(res?.data) ? res.data[0] : res?.data) || res;
      return normalizeStudent(updated);
    } catch (err) {
      console.error('[studentService] Error updating student:', err.message);
      throw err;
    }
  },

  deleteStudent: async (id) => {
    if (!id) throw new Error('Student ID is required for deletion');

    try {
      const res = await apiClient.delete(`/api/students/${encodeURIComponent(id)}`);
      return res;
    } catch (err) {
      console.error('[studentService] Error deleting student:', err.message);
      throw err;
    }
  },
};

export default studentService;

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
   * Add a new student record
   * Endpoint: POST /api/students
   * @param {Object} student - { student_id, name, year, academic_year }
   */
  addStudent: async ({ student_id, student_name, name, year, academic_year }) => {
    const cleanId = String(student_id || '').trim();
    const cleanName = String(student_name || name || '').trim();
    const rawYear = year || academic_year || '1st Year';
    const dbYear = mapYearToDb(rawYear);

    if (!cleanId) throw new Error('Student ID is required');
    if (!cleanName) throw new Error('Student Name is required');
    if (!dbYear) throw new Error('Year is required');

    const payload = {
      student_id: cleanId,
      student_name: cleanName,
      year: dbYear,
      academic_year: dbYear,
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
  addStudentsBulk: async (students) => {
    if (!Array.isArray(students) || students.length === 0) {
      throw new Error('No students provided for bulk insertion');
    }

    const formattedPayload = students.map((s) => {
      const dbYear = mapYearToDb(s.year || s.academic_year);
      return {
        student_id: String(s.student_id || '').trim(),
        student_name: String(s.student_name || s.name || '').trim(),
        year: dbYear,
        academic_year: dbYear,
      };
    });

    // Attempt bulk API endpoint if supported by backend
    try {
      const res = await apiClient.post('/api/students/bulk', { students: formattedPayload });
      return { successCount: students.length, failedCount: 0, res };
    } catch {
      // Fallback: batch individual creations concurrently
      let successCount = 0;
      let failedCount = 0;
      const errors = [];

      for (const std of formattedPayload) {
        try {
          await studentService.addStudent(std);
          successCount++;
        } catch (err) {
          failedCount++;
          errors.push({ student_id: std.student_id, error: err.message });
        }
      }

      return { successCount, failedCount, errors };
    }
  },

  /**
   * Delete a student record by database ID or student_id
   * Endpoint: DELETE /api/students/:id
   * @param {string|number} id
   */
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

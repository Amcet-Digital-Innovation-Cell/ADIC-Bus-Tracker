/**
 * routes/students.js
 * ─────────────────────────────────────────────────────────────
 * Student Management & Mobile App Authentication Routes.
 *
 * Route Architecture:
 * ─────────────────────────────────────────────────────────────
 * 🟢 PUBLIC ROUTES (Flutter Mobile App — AmcetTransit):
 *    1. GET  /api/students/verify/:student_id  — Verify student ID & auto-fetch info
 *    2. POST /api/students/register           — Student self-registration with payload handling
 *    3. POST /api/students/login              — Authenticate student via student_id/email & password
 *    4. POST /api/students/forgot-password    — Generate & email new activation key / reset token
 *    5. POST /api/students/reset-password     — Reset password using current key/token
 *
 * 🔒 PROTECTED ROUTES (Transport Admin Dashboard — Supabase JWT Required):
 *    6. GET    /api/students                  — Fetch student roster (chunked pagination >1000)
 *    7. POST   /api/students/import           — Bulk import / pre-load student records (Admin)
 *    8. POST   /api/students/bulk             — Alias for bulk import (Admin)
 *    9. POST   /api/students                  — Alias for single/bulk import (Admin)
 *    10. PUT   /api/students/:id              — Update existing student record
 *    11. DELETE /api/students/:id             — Remove student record
 * ─────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { adminSupabase, db: schemaDb } = require('../config/supabase');
const { authenticate } = require('../middleware/auth.middleware');
const { sendActivationKeyEmail, getBrevoStatus } = require('../utils/email');

// Scoped database client for students schema (uses service-role client for RLS bypass when available)
const getStudentDb = () => schemaDb.students;

// ── Permissive authentication for admin student roster view ───────────────
const optionalAuthenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        if (process.env.NODE_ENV === 'production') {
            return authenticate(req, res, next);
        }
        return next();
    }
    return authenticate(req, res, next);
};

// ── Cache for Valid Student Columns ───────────────────────────────────────
let cachedStudentColumns = null;

/**
 * Introspect available columns on the students table at runtime.
 * Caches the column set so we never send unknown fields to PostgREST.
 */
async function getStudentColumns(db) {
    if (cachedStudentColumns && cachedStudentColumns.size > 0) {
        return cachedStudentColumns;
    }
    try {
        const { data, error } = await db.from('students').select('*').limit(1);
        if (!error && data && data.length > 0) {
            cachedStudentColumns = new Set(Object.keys(data[0]));
            return cachedStudentColumns;
        }
    } catch (e) {
        console.warn('[Student Schema] Could not introspect columns, using default fallback set:', e.message);
    }
    // Baseline columns verified in students.students
    return new Set([
        'id', 'student_id', 'student_name', 'email', 'student_email', 'department',
        'department_code', 'academic_year', 'year', 'pass_out_year', 'student_mobile',
        'parent_name', 'parent_phone', 'emergency_contact', 'activation_key',
        'bus_number', 'route_id', 'stop_id', 'route_name',
        'boarding_stop', 'stop_name', 'drop_stop', 'pass_status',
        'pass_expiry_date', 'is_registered', 'registered_at', 'last_login_at',
        'created_at', 'updated_at'
    ]);
}

/**
 * Filter an object payload so it only contains valid columns that exist in the database table.
 */
function filterValidStudentColumns(payload, validCols) {
    if (!payload || typeof payload !== 'object') return {};
    const filtered = {};
    for (const [key, value] of Object.entries(payload)) {
        if (key === 'bus_id') continue;
        if (validCols.has(key)) {
            filtered[key] = value;
        }
    }
    return filtered;
}

// ── Helpers ──────────────────────────────────────────────────────────────
/**
 * Generate a secure, user-friendly activation key in AM-XXXX format.
 */
function generateActivationKey() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const bytes = crypto.randomBytes(4);
    let randomPart = '';
    for (let i = 0; i < 4; i++) {
        randomPart += chars[bytes[i] % chars.length];
    }
    return `AM-${randomPart}`;
}


/**
 * Verifies a candidate password against a stored key or hash.
 * Supports:
 *   1. AM-XXXX temporary activation keys (case-insensitive)
 *   2. PBKDF2 hashes (s2$<salt>$<hash>)
 *   3. bcrypt hashes ($2b$, $2a$, $2y$)
 *   4. Direct string comparison
 */
function verifyPassword(candidate, stored) {
    if (!candidate || !stored) return false;
    const cleanCand = String(candidate).trim();
    const cleanStored = String(stored).trim();

    // 1. Direct or case-insensitive match (e.g. AM-XXXX activation keys)
    if (cleanCand.toLowerCase() === cleanStored.toLowerCase() || cleanCand === cleanStored) {
        return true;
    }

    // 2. PBKDF2 format: s2$<salt>$<hash>
    if (cleanStored.startsWith('s2$')) {
        const parts = cleanStored.split('$');
        if (parts.length === 3) {
            const salt = parts[1];
            const storedHash = parts[2];
            const hash = crypto.pbkdf2Sync(cleanCand, salt, 10000, 21, 'sha256').toString('base64').replace(/=/g, '').slice(0, 28);
            if (hash === storedHash) {
                return true;
            }
        }
    }

    // 3. bcrypt format: $2a$, $2b$, $2y$
    if (/^\$2[aby]\$\d{2}\$/.test(cleanStored)) {
        try {
            const bcrypt = require('bcryptjs');
            return bcrypt.compareSync(cleanCand, cleanStored);
        } catch (e) {
            // fallback
        }
    }

    return false;
}


/**
 * Mask email address for privacy in API responses (e.g., "lo***h@gmail.com")
 */
function maskEmail(email) {
    if (!email || !email.includes('@')) return email || '';
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `${local[0]}*@${domain}`;
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Resolve Bus and Route metadata from transport schema based on route_name, route_id, or stop_name.
 *
 * Supports flexible calling signatures:
 *   - resolveTransitInfo({ routeName, routeId, stopName })
 *   - resolveTransitInfo(routeId, stopName, routeName)
 */
async function resolveTransitInfo(arg1, arg2, arg3) {
    let routeId = arg1;
    let stopName = arg2;
    let routeName = arg3;

    if (typeof arg1 === 'object' && arg1 !== null) {
        routeId = arg1.routeId ?? arg1.route_id;
        routeName = arg1.routeName ?? arg1.route_name;
        stopName = arg1.stopName ?? arg1.stop_name ?? arg2;
    }

    let resolvedRouteId = routeId !== undefined && routeId !== null && String(routeId).trim() !== '' && !isNaN(parseInt(routeId, 10))
        ? parseInt(routeId, 10)
        : null;
    let resolvedRouteName = routeName ? String(routeName).trim() : null;
    let resolvedBusId = null;
    let resolvedBusNumber = null;
    let resolvedVehicleNumber = null;
    let routeFound = false;

    try {
        // 1. If route_name provided, look up route in transport.bus_routes (case-insensitive)
        if (resolvedRouteName) {
            const cleanName = resolvedRouteName.replace(/[%_]/g, '\\$&');
            let { data: routeByName, error: nameErr } = await schemaDb.transport
                .from('bus_routes')
                .select('id, route_name')
                .ilike('route_name', cleanName)
                .maybeSingle();

            // Fallback to bus_routes if not found or error
            if (!routeByName && adminSupabase) {
                const { data: pubRoute } = await adminSupabase
                    .from('bus_routes')
                    .select('id, route_name')
                    .ilike('route_name', cleanName)
                    .maybeSingle();
                if (pubRoute) routeByName = pubRoute;
            }

            // Fallback: search all routes for normalized or partial match
            if (!routeByName) {
                let allRoutesRes = await schemaDb.transport
                    .from('bus_routes')
                    .select('id, route_name');
                if ((!allRoutesRes.data || allRoutesRes.data.length === 0) && adminSupabase) {
                    allRoutesRes = await adminSupabase
                        .from('bus_routes')
                        .select('id, route_name');
                }
                if (allRoutesRes.data && allRoutesRes.data.length > 0) {
                    const normInput = resolvedRouteName.toLowerCase().replace(/[^a-z0-9]/g, '');
                    routeByName = allRoutesRes.data.find(r => {
                        const normR = String(r.route_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                        return normR === normInput;
                    });
                    if (!routeByName) {
                        routeByName = allRoutesRes.data.find(r => {
                            const rName = String(r.route_name || '').toLowerCase();
                            const inputLower = resolvedRouteName.toLowerCase();
                            return rName.includes(inputLower) || inputLower.includes(rName);
                        });
                    }
                }
            }

            if (routeByName) {
                resolvedRouteId = routeByName.id;
                resolvedRouteName = routeByName.route_name || resolvedRouteName;
                routeFound = true;
            }
        }

        // 2. If route_id provided and route not yet resolved, look up route by id
        if (resolvedRouteId && !routeFound) {
            let { data: routeById } = await schemaDb.transport
                .from('bus_routes')
                .select('id, route_name')
                .eq('id', resolvedRouteId)
                .maybeSingle();

            if (!routeById && adminSupabase) {
                const { data: pubRouteId } = await adminSupabase
                    .from('bus_routes')
                    .select('id, route_name')
                    .eq('id', resolvedRouteId)
                    .maybeSingle();
                if (pubRouteId) routeById = pubRouteId;
            }

            if (routeById) {
                resolvedRouteName = routeById.route_name || resolvedRouteName;
                routeFound = true;
            }
        }

        // 3. Query transport.buses table using this route_id to retrieve the corresponding bus id as bus_id
        if (resolvedRouteId) {
            let { data: busData } = await schemaDb.transport
                .from('buses')
                .select('id, bus_number, vehicle_number, route_id, route_name')
                .eq('route_id', resolvedRouteId)
                .maybeSingle();

            if (!busData && adminSupabase) {
                const { data: pubBus } = await adminSupabase
                    .from('buses')
                    .select('id, bus_number, vehicle_number, route_id, route_name')
                    .eq('route_id', resolvedRouteId)
                    .maybeSingle();
                if (pubBus) busData = pubBus;
            }

            if (busData) {
                resolvedBusId = busData.id;
                resolvedBusNumber = busData.bus_number;
                resolvedVehicleNumber = busData.vehicle_number;
                if (!resolvedRouteName) resolvedRouteName = busData.route_name;
            } else if (resolvedRouteName) {
                // If not found by route_id, try matching bus by route_name
                let { data: busByName } = await schemaDb.transport
                    .from('buses')
                    .select('id, bus_number, vehicle_number, route_id, route_name')
                    .ilike('route_name', resolvedRouteName.replace(/[%_]/g, '\\$&'))
                    .maybeSingle();

                if (busByName) {
                    resolvedBusId = busByName.id;
                    resolvedBusNumber = busByName.bus_number;
                    resolvedVehicleNumber = busByName.vehicle_number;
                }
            }
        }

        // 4. If stop_name provided and bus/route not yet resolved, check bus_stops
        if (stopName && (!resolvedRouteId || !resolvedBusId)) {
            const cleanStop = String(stopName).trim();
            const { data: stopData } = await schemaDb.transport
                .from('bus_stops')
                .select('id, bus_id, route_id, stop_name')
                .ilike('stop_name', cleanStop.replace(/[%_]/g, '\\$&'))
                .maybeSingle();

            if (stopData) {
                if (!resolvedRouteId && stopData.route_id) {
                    resolvedRouteId = stopData.route_id;
                    routeFound = true;
                }
                if (!resolvedBusId && stopData.bus_id) resolvedBusId = stopData.bus_id;

                if (resolvedBusId && !resolvedBusNumber) {
                    const { data: bData } = await schemaDb.transport
                        .from('buses')
                        .select('id, bus_number, vehicle_number, route_id, route_name')
                        .eq('id', resolvedBusId)
                        .maybeSingle();
                    if (bData) {
                        resolvedBusNumber = bData.bus_number;
                        resolvedVehicleNumber = bData.vehicle_number;
                        if (!resolvedRouteId && bData.route_id) resolvedRouteId = bData.route_id;
                        if (!resolvedRouteName) resolvedRouteName = bData.route_name;
                    }
                }
            }
        }
    } catch (err) {
        console.warn('[Resolve Transit Info] Non-fatal transit lookup error:', err.message);
    }

    return {
        route_id: resolvedRouteId,
        bus_id: resolvedBusId,
        route_name: resolvedRouteName,
        bus_number: resolvedBusNumber,
        vehicle_number: resolvedVehicleNumber,
        found: routeFound || Boolean(resolvedRouteId)
    };
}

/**
 * Format student record for API response, ensuring registration status,
 * is_registered flag, activation key, and academic year are uniformly populated.
 */
function formatStudentRecord(student, routeMap, busMap) {
    if (!student) return null;

    const studentName = student.student_name || student.name || '';
    const studentId = student.student_id || student.register_no || '';

    const isRegistered = Boolean(
        student.is_registered === true ||
        student.is_registered === 'true' ||
        (typeof student.activation_key === 'string' && student.activation_key.toUpperCase().startsWith('AM-')) ||
        (Boolean(student.email) && String(student.email).trim().length > 0)
    );

    const routeId = student.route_id ? parseInt(student.route_id, 10) : null;
    const busNumberVal = student.bus_number ? String(student.bus_number).trim() : null;

    const routeInfo = routeMap && routeId ? routeMap.get(routeId) : null;
    const busInfo = busMap && busNumberVal
        ? (busMap.get(`bus_${busNumberVal}`) || busMap.get(busNumberVal))
        : (busMap && routeId ? busMap.get(`route_${routeId}`) : null);

    const routeName = student.route_name || routeInfo?.route_name || busInfo?.route_name || null;
    const busNumber = busNumberVal || busInfo?.bus_number || null;

    // Match stop_name using stop_id from route's stops JSON if available
    let matchedStopName = null;
    const stopIdVal = student.stop_id !== undefined && student.stop_id !== null && student.stop_id !== ''
        ? String(student.stop_id).trim()
        : null;

    if (stopIdVal && routeInfo?.stopMap) {
        matchedStopName = routeInfo.stopMap.get(String(stopIdVal)) || null;
    }

    const stopName = matchedStopName || student.stop_name || student.boarding_stop || null;

    // Normalizing academic year so "1.0" or "3.0" becomes "1st Year", "3rd Year" for dashboard UI
    const displayYear = (function (y) {
        if (!y) return '1st Year';
        const clean = String(y).trim();
        if (clean === '1.0' || clean === '1' || clean === 'I' || clean.toLowerCase() === '1st' || clean === '1st Year') return '1st Year';
        if (clean === '2.0' || clean === '2' || clean === 'II' || clean.toLowerCase() === '2nd' || clean === '2nd Year') return '2nd Year';
        if (clean === '3.0' || clean === '3' || clean === 'III' || clean.toLowerCase() === '3rd' || clean === '3rd Year') return '3rd Year';
        if (clean === '4.0' || clean === '4' || clean === 'IV' || clean.toLowerCase() === '4th' || clean === '4th Year') return '4th Year';
        return clean;
    })(student.academic_year || student.year);

    const formatted = {
        ...student,
        id: student.id,
        student_id: studentId,
        student_name: studentName,
        name: studentName,
        student_mobile: student.student_mobile || student.phone || '',
        year: displayYear,
        academic_year: displayYear,
        department: student.department || '',
        route_id: routeId,
        route_name: routeName,
        stop_id: stopIdVal,
        bus_number: busNumber,
        stop_name: stopName,
        boarding_stop: stopName,
        parent_name: student.parent_name || '',
        email: student.email || student.student_email || '',
        student_email: student.student_email || student.email || '',
        emergency_contact: student.emergency_contact || student.parent_phone || '',
        is_registered: isRegistered,
        registration_status: isRegistered ? 'Registered' : 'Not Registered',
        activation_key: student.activation_key || null,
        registered_at: student.registered_at || (isRegistered ? student.updated_at : null)
    };

    // Explicitly remove legacy columns that no longer exist
    delete formatted.route_code;
    delete formatted.register_no;
    delete formatted.section;
    delete formatted.phone;
    delete formatted.device_status;
    delete formatted.bus_id;

    return formatted;
}


// ═════════════════════════════════════════════════════════════════════════
// 🟢 PUBLIC ROUTES (STUDENT FLUTTER MOBILE APP — NO JWT REQUIRED)
// ═════════════════════════════════════════════════════════════════════════

/**
 * 1. GET /api/students/verify/:student_id
 * ─────────────────────────────────────────────────────────────
 * Purpose: Flutter mobile app verifies if Student ID exists in college records.
 * Returns: Pre-loaded student name, year, and registration status for auto-fill.
 */
router.get('/verify/:student_id', async (req, res) => {
    try {
        const { student_id } = req.params;
        const cleanStudentId = String(student_id || '').trim();

        if (!cleanStudentId) {
            return res.status(400).json({
                success: false,
                error: 'Student ID parameter is required.',
                message: 'Student ID parameter is required.'
            });
        }

        const db = getStudentDb();
        const { data: student, error } = await db
            .from('students')
            .select('*')
            .ilike('student_id', cleanStudentId.replace(/[%_]/g, '\\$&'))
            .maybeSingle();

        if (error) {
            console.error('[Student Verify] Supabase error:', error.message);
            return res.status(500).json({
                success: false,
                error: 'Internal server error verifying student ID.',
                message: 'Internal server error verifying student ID.'
            });
        }

        if (!student) {
            return res.status(404).json({
                success: false,
                error: 'Student ID not found in college records.',
                message: 'Student ID not found in college records.'
            });
        }

        const isRegistered = Boolean(
            student.is_registered === true ||
            (student.email && String(student.email).trim().length > 0 && student.activation_key)
        );
        const studentName = student.student_name || '';

        // Optional transit info lookup
        let transitInfo = {};
        if (student.route_id || student.route_name || student.bus_number) {
            transitInfo = await resolveTransitInfo({
                routeId: student.route_id,
                busNumber: student.bus_number,
                routeName: student.route_name,
                stopName: student.stop_name || student.boarding_stop
            });
        }

        const verifiedStudentData = {
            id: student.id,
            student_id: student.student_id,
            student_name: studentName,
            email: student.email || '',
            student_mobile: student.student_mobile || '',
            year: student.academic_year || '1st Year',
            academic_year: student.academic_year || '1st Year',
            department: student.department || '',
            route_id: student.route_id || transitInfo.route_id || null,
            route_name: student.route_name || transitInfo.route_name || null,
            bus_number: student.bus_number || transitInfo.bus_number || null,
            stop_name: student.stop_name || student.boarding_stop || null,
            boarding_stop: student.boarding_stop || student.stop_name || null,
            is_registered: isRegistered,
        };

        const responseMessage = isRegistered
            ? 'Student is already registered. Please sign in with your credentials.'
            : 'Student ID verified successfully.';

        return res.status(200).json({
            success: true,
            message: responseMessage,
            // Dual envelopes for Flutter models
            student: verifiedStudentData,
            data: verifiedStudentData,
            // Top-level fields preserved for backwards compatibility
            ...verifiedStudentData
        });

    } catch (err) {
        console.error('[Student Verify] Server exception:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error verifying student ID.',
            message: 'Internal server error verifying student ID.'
        });
    }
});

/**
 * 2. POST /api/students/register
 * ─────────────────────────────────────────────────────────────
 * Purpose: Student self-registration from the Flutter mobile app (AmcetTransit).
 * Inputs:  student_id, student_name, email, password/hash (optional), route_id, stop_name,
 *          department, academic_year, student_mobile (phone), parent_name, parent_phone.
 * Logic:
 *   - Parses & validates inputs to avoid malformed data.
 *   - Checks for duplicate student ID (returns 409 if already registered).
 *   - Checks for duplicate email registered to another student.
 *   - Resolves bus and route info from route_id or stop_name.
 *   - Stores user's password or generates an AM-XXXX activation key.
 *   - Updates pre-loaded record or creates a new student registration record.
 *   - Sends email confirmation/activation key via Brevo HTTP API.
 */
router.post('/register', async (req, res) => {
    try {
        const body = req.body || {};
        const {
            student_id,
            register_no,
            roll_no,
            id,
            student_name,
            name,
            full_name,
            email,
            // Passwords from frontend are explicitly NOT accepted.
            // A secure temporary activation key (AM-XXXX) is generated on the server.
            route_name,
            route,
            route_id,
            stop_name,
            boarding_stop,
            stop,
            department,
            academic_year,
            year,
            pass_out_year,
            student_mobile,
            phone,
            parent_name,
            parent_phone,
            emergency_contact
        } = body;

        // Clean & sanitize input values
        const cleanStudentId = String(student_id || register_no || roll_no || id || '').trim();
        const cleanStudentName = String(student_name || name || full_name || '').trim();
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanPhone = String(student_mobile || phone || '').trim();
        const cleanParentName = parent_name ? String(parent_name).trim() : null;
        const cleanParentPhone = parent_phone ? String(parent_phone).trim() : null;
        const cleanDepartment = department ? String(department).trim() : null;
        const cleanYear = academic_year || year ? String(academic_year || year).trim() : null;
        const cleanStopName = String(stop_name || boarding_stop || stop || '').trim();
        const cleanRouteName = String(
            route_name ||
            route ||
            body.bus_route ||
            body.selected_route ||
            ''
        ).trim();
        const cleanRouteId = route_id !== undefined && route_id !== null && String(route_id).trim() !== '' && !isNaN(parseInt(route_id, 10))
            ? parseInt(route_id, 10)
            : null;

        // ── Validation ────────────────────────────────────────────────────────
        if (!cleanStudentId) {
            return res.status(400).json({
                success: false,
                error: 'Student ID is required.',
                message: 'Student ID is required.'
            });
        }

        if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return res.status(400).json({
                success: false,
                error: 'A valid email address is required.',
                message: 'A valid email address is required.'
            });
        }

        const db = getStudentDb();

        // ── Check if Student ID already exists in college database ─────────────
        let { data: existingStudent, error: fetchError } = await db
            .from('students')
            .select('*')
            .ilike('student_id', cleanStudentId.replace(/[%_]/g, '\\$&'))
            .maybeSingle();

        // Fallback check
        if (!existingStudent && adminSupabase) {
            const { data: pubExisting } = await adminSupabase
                .from('students')
                .select('*')
                .ilike('student_id', cleanStudentId.replace(/[%_]/g, '\\$&'))
                .maybeSingle();
            if (pubExisting) existingStudent = pubExisting;
        }

        if (fetchError) {
            console.error('[Student Register] Supabase fetch error:', fetchError.message);
            return res.status(500).json({
                success: false,
                error: 'Internal server error checking student ID.',
                message: 'Internal server error checking student ID.'
            });
        }

        // Check if student is already fully registered
        if (existingStudent) {
            const isAlreadyRegistered = Boolean(
                existingStudent.is_registered === true ||
                existingStudent.is_registered === 'true' ||
                (existingStudent.email && String(existingStudent.email).trim().length > 0 &&
                    existingStudent.activation_key && String(existingStudent.activation_key).trim().length > 0)
            );

            if (isAlreadyRegistered) {
                return res.status(409).json({
                    success: false,
                    error: 'This Student ID is already registered. Please sign in or use "Forgot Password" to retrieve your credentials.',
                    message: 'This Student ID is already registered. Please sign in or use "Forgot Password" to retrieve your credentials.'
                });
            }
        }

        // ── Prevent duplicate email across different student IDs ──────────────
        const { data: emailMatch, error: emailError } = await db
            .from('students')
            .select('id, student_id, email')
            .ilike('email', cleanEmail)
            .maybeSingle();

        if (!emailError && emailMatch && String(emailMatch.student_id).toUpperCase() !== cleanStudentId.toUpperCase()) {
            return res.status(409).json({
                success: false,
                error: `The email address ${cleanEmail} is already registered with another student account (${emailMatch.student_id}).`,
                message: `The email address ${cleanEmail} is already registered with another student account (${emailMatch.student_id}).`
            });
        }

        // ── Server-Side Temporary Password Generation (AM-XXXX) ───────────────
        const temporaryPassword = generateActivationKey();

        // ── 2. Route & Stop Resolution from bus_routes (JSON stops array) ─────
        let targetRoute = null;

        if (cleanRouteName) {
            const cleanRName = cleanRouteName.replace(/[%_]/g, '\\$&');
            let { data: rData } = await schemaDb.transport
                .from('bus_routes')
                .select('id, route_name, stops')
                .ilike('route_name', cleanRName)
                .maybeSingle();

            if (!rData && adminSupabase) {
                const { data: pubR } = await adminSupabase
                    .from('bus_routes')
                    .select('id, route_name, stops')
                    .ilike('route_name', cleanRName)
                    .maybeSingle();
                if (pubR) rData = pubR;
            }

            // Fallback: search all routes for normalized or partial match
            if (!rData) {
                let allR = await schemaDb.transport.from('bus_routes').select('id, route_name, stops');
                if ((!allR.data || allR.data.length === 0) && adminSupabase) {
                    allR = await adminSupabase.from('bus_routes').select('id, route_name, stops');
                }
                if (allR.data && allR.data.length > 0) {
                    const normInput = cleanRouteName.toLowerCase().replace(/[^a-z0-9]/g, '');
                    rData = allR.data.find(r => String(r.route_name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === normInput);
                    if (!rData) {
                        rData = allR.data.find(r => {
                            const rName = String(r.route_name || '').toLowerCase();
                            const inputLower = cleanRouteName.toLowerCase();
                            return rName.includes(inputLower) || inputLower.includes(rName);
                        });
                    }
                }
            }
            targetRoute = rData;
        } else if (cleanRouteId) {
            let { data: rData } = await schemaDb.transport
                .from('bus_routes')
                .select('id, route_name, stops')
                .eq('id', cleanRouteId)
                .maybeSingle();

            if (!rData && adminSupabase) {
                const { data: pubR } = await adminSupabase
                    .from('bus_routes')
                    .select('id, route_name, stops')
                    .eq('id', cleanRouteId)
                    .maybeSingle();
                if (pubR) rData = pubR;
            }
            targetRoute = rData;
        } else if (existingStudent?.route_id || existingStudent?.route_name) {
            let rQuery = schemaDb.transport.from('bus_routes').select('id, route_name, stops');
            if (existingStudent.route_id) {
                rQuery = rQuery.eq('id', existingStudent.route_id);
            } else {
                rQuery = rQuery.ilike('route_name', String(existingStudent.route_name).replace(/[%_]/g, '\\$&'));
            }
            const { data: rData } = await rQuery.maybeSingle();
            targetRoute = rData;
        }

        if (!targetRoute) {
            return res.status(400).json({
                success: false,
                error: cleanRouteName
                    ? `Route "${cleanRouteName}" was not found in college bus records. Please select a valid route.`
                    : 'Route name is required. Please select a valid bus route.',
                message: cleanRouteName
                    ? `Route "${cleanRouteName}" was not found in college bus records. Please select a valid route.`
                    : 'Route name is required. Please select a valid bus route.'
            });
        }

        // ── 3. Parse stops JSON array & match stop_name to extract full stop_id ──
        let stopsList = [];
        if (Array.isArray(targetRoute.stops)) {
            stopsList = targetRoute.stops;
        } else if (typeof targetRoute.stops === 'string') {
            try {
                stopsList = JSON.parse(targetRoute.stops);
            } catch (_) {
                stopsList = [];
            }
        }

        let matchedStop = null;
        if (cleanStopName) {
            const cleanStopLower = cleanStopName.trim().toLowerCase();
            // Exact case-insensitive match
            matchedStop = stopsList.find(s => {
                const sName = String(s.stop_name || s.name || '').trim().toLowerCase();
                return sName === cleanStopLower;
            });

            // Partial match fallback
            if (!matchedStop) {
                matchedStop = stopsList.find(s => {
                    const sName = String(s.stop_name || s.name || '').trim().toLowerCase();
                    return sName.includes(cleanStopLower) || cleanStopLower.includes(sName);
                });
            }

            if (!matchedStop) {
                return res.status(400).json({
                    success: false,
                    error: `Stop "${cleanStopName}" does not belong to route "${targetRoute.route_name}".`,
                    message: `Stop "${cleanStopName}" does not belong to route "${targetRoute.route_name}".`,
                    available_stops: stopsList.map(s => s.stop_name || s.name)
                });
            }
        } else if (cleanStopId) {
            matchedStop = stopsList.find(s => String(s.id).trim() === String(cleanStopId).trim());
            if (!matchedStop) {
                return res.status(400).json({
                    success: false,
                    error: `Stop ID "${cleanStopId}" does not exist in route "${targetRoute.route_name}".`,
                    message: `Stop ID "${cleanStopId}" does not exist in route "${targetRoute.route_name}".`
                });
            }
        } else {
            return res.status(400).json({
                success: false,
                error: 'Assigned bus stop (stop_name) is required. Please select a valid stop.',
                message: 'Assigned bus stop (stop_name) is required. Please select a valid stop.'
            });
        }

        // Extract the full, high-precision stop ID as a pure string (never numeric/integer parsed)
        const resolvedStopId = matchedStop && matchedStop.id !== undefined && matchedStop.id !== null
            ? String(matchedStop.id).trim()
            : (cleanStopId ? String(cleanStopId).trim() : null);
        const resolvedStopName = matchedStop
            ? String(matchedStop.stop_name || matchedStop.name || cleanStopName).trim()
            : cleanStopName;

        // Query corresponding bus assigned to this route
        let resolvedBusNumber = null;
        try {
            let { data: busData } = await schemaDb.transport
                .from('buses')
                .select('id, bus_number, vehicle_number')
                .eq('route_id', targetRoute.id)
                .maybeSingle();

            if (!busData && adminSupabase) {
                const { data: pubBus } = await adminSupabase
                    .from('buses')
                    .select('id, bus_number, vehicle_number')
                    .eq('route_id', targetRoute.id)
                    .maybeSingle();
                if (pubBus) busData = pubBus;
            }
            if (busData?.bus_number) resolvedBusNumber = busData.bus_number;
        } catch (_) {}

        // ── 4. Store in Student Record ─────────────────────────────────────────
        const validCols = await getStudentColumns(db);

        const nowIso = new Date().toISOString();
        const resolvedName = cleanStudentName || existingStudent?.student_name || 'Student';

        const rawPayload = {
            student_id: cleanStudentId,
            student_name: resolvedName,
            email: cleanEmail,
            activation_key: temporaryPassword, // Stored temporary password
            is_registered: true,
            registered_at: nowIso,
            updated_at: nowIso,
            route_name: targetRoute.route_name,
            route_id: targetRoute.id
        };

        if (resolvedBusNumber) rawPayload.bus_number = resolvedBusNumber;
        if (cleanPhone) rawPayload.student_mobile = cleanPhone;
        if (cleanDepartment) rawPayload.department = cleanDepartment;
        if (cleanYear) rawPayload.academic_year = cleanYear;
        if (cleanParentName) rawPayload.parent_name = cleanParentName;
        if (cleanParentPhone) rawPayload.parent_phone = cleanParentPhone;
        if (emergency_contact) rawPayload.emergency_contact = emergency_contact;
        if (pass_out_year) rawPayload.pass_out_year = parseInt(pass_out_year, 10);

        // Store full high-precision stop ID as string without truncation
        if (resolvedStopId) {
            rawPayload.stop_id = resolvedStopId;
        }

        // Store stop name into both stop_name and boarding_stop columns
        if (resolvedStopName) {
            if (validCols.has('stop_name')) rawPayload.stop_name = resolvedStopName;
            if (validCols.has('boarding_stop')) rawPayload.boarding_stop = resolvedStopName;
            if (!validCols.has('stop_name') && !validCols.has('boarding_stop')) {
                rawPayload.stop_name = resolvedStopName;
                rawPayload.boarding_stop = resolvedStopName;
            }
        }

        // Filter payload so only existing database columns are sent
        const dbPayload = filterValidStudentColumns(rawPayload, validCols);

        let savedStudent = null;

        if (existingStudent) {
            // Update existing pre-loaded student record in students.students
            const { data: updated, error: updateError } = await db
                .from('students')
                .update(dbPayload)
                .eq('student_id', existingStudent.student_id)
                .select()
                .single();

            if (updateError) {
                console.error('[Student Register] Supabase update error:', updateError.message);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to update student registration record in database.',
                    message: updateError.message
                });
            }
            savedStudent = updated;

        } else {
            // Self-registration for new student
            if (!cleanStudentName) {
                return res.status(400).json({
                    success: false,
                    error: 'Student Name is required for registration.',
                    message: 'Student Name is required for registration.'
                });
            }

            dbPayload.created_at = nowIso;

            const { data: inserted, error: insertError } = await db
                .from('students')
                .insert(dbPayload)
                .select()
                .single();

            if (insertError) {
                console.error('[Student Register] Supabase insert error:', insertError.message);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to create student registration record in database.',
                    message: insertError.message
                });
            }
            savedStudent = inserted;
        }

        // ── Record in activation_keys audit trail table ────────────────────────
        try {
            await db.from('activation_keys').insert({
                student_id: cleanStudentId,
                activation_key: temporaryPassword,
                key_type: 'registration',
                is_used: false,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            });
        } catch (auditErr) {
            // Non-critical audit trail
            console.warn('[Student Register] Audit key table insertion skipped:', auditErr.message);
        }

        // ── Dispatch activation key email asynchronously in the background ──────
        const masked = maskEmail(cleanEmail);
        setImmediate(() => {
            sendActivationKeyEmail({
                email: cleanEmail,
                name: savedStudent.student_name,
                student_name: savedStudent.student_name,
                studentId: savedStudent.student_id,
                activationKey: temporaryPassword,
                type: 'registration'
            }).catch(emailErr => {
                console.error('[Student Register] Background email delivery failed:', emailErr.message);
            });
        });

        const successMessage = `Registration successful! Your temporary password has been sent to your registered email (${masked}).`;

        const registeredStudent = {
            id: savedStudent.id,
            student_id: savedStudent.student_id,
            student_name: savedStudent.student_name,
            email: savedStudent.email,
            student_mobile: savedStudent.student_mobile || '',
            department: savedStudent.department || '',
            academic_year: savedStudent.academic_year || '1st Year',
            year: savedStudent.academic_year || '1st Year',
            route_id: savedStudent.route_id || targetRoute.id,
            route_name: savedStudent.route_name || targetRoute.route_name,
            bus_number: savedStudent.bus_number || resolvedBusNumber || null,
            stop_id: savedStudent.stop_id || resolvedStopId || null,
            stop_name: resolvedStopName || savedStudent.stop_name || savedStudent.boarding_stop || null,
            boarding_stop: resolvedStopName || savedStudent.boarding_stop || savedStudent.stop_name || null,
            is_registered: true,
            registration_status: 'Registered'
        };

        return res.status(201).json({
            success: true,
            message: successMessage,
            student: registeredStudent,
            data: registeredStudent,
            email_sent: true,
            email_hint: masked
        });

    } catch (err) {
        console.error('[Student Register] Server exception:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during registration.',
            message: 'Internal server error during registration.'
        });
    }
});

/**
 * 3. POST /api/students/login
 * ─────────────────────────────────────────────────────────────
 * Purpose: Authenticate student in the Flutter mobile app (AmcetTransit).
 * Inputs:  student_id (or email), password (or activation_key).
 * Logic:
 *   - Flexible identifier lookup: supports Student ID or Email address.
 *   - Verifies against stored activation_key / password in students table.
 *   - Checks activation_keys audit table if needed.
 *   - Fetches and returns associated bus & route details.
 *   - Returns proper HTTP status (200 success, 400 validation, 401 invalid credentials).
 */
router.post('/login', async (req, res) => {
    try {
        const body = req.body || {};
        const {
            student_id,
            email,
            identifier,
            username,
            password,
            activation_key,
            key
        } = body;

        const cleanIdentifier = String(student_id || email || identifier || username || '').trim();
        const cleanPassword = String(password || activation_key || key || '').trim();

        // ── Validation ────────────────────────────────────────────────────────
        if (!cleanIdentifier) {
            return res.status(400).json({
                success: false,
                error: 'Student ID or Email is required.',
                message: 'Student ID or Email is required.'
            });
        }

        if (!cleanPassword) {
            return res.status(400).json({
                success: false,
                error: 'Password or Activation Key is required.',
                message: 'Password or Activation Key is required.'
            });
        }

        const db = getStudentDb();
        const isEmail = cleanIdentifier.includes('@');

        // Look up student by email or student_id
        let query = db.from('students').select('*');
        if (isEmail) {
            query = query.ilike('email', cleanIdentifier.toLowerCase());
        } else {
            query = query.ilike('student_id', cleanIdentifier.replace(/[%_]/g, '\\$&'));
        }

        const { data: student, error: fetchError } = await query.maybeSingle();

        if (fetchError) {
            console.error('[Student Login] Supabase fetch error:', fetchError.message);
            return res.status(500).json({
                success: false,
                error: 'Internal server error during authentication.',
                message: 'Internal server error during authentication.'
            });
        }

        // Student record not found
        if (!student) {
            return res.status(401).json({
                success: false,
                error: 'Invalid Student ID or credentials.',
                message: 'Invalid Student ID or credentials.'
            });
        }

        // ── Verify Credential (activation_key / password) ─────────────────────
        const storedKey = String(student.activation_key || '').trim();
        const inputKey = cleanPassword;

        let isMatch = verifyPassword(inputKey, storedKey);

        // Fallback: check activation_keys table if not matched against primary row
        if (!isMatch) {
            try {
                const { data: keyRecord } = await db
                    .from('activation_keys')
                    .select('*')
                    .eq('student_id', student.student_id)
                    .ilike('activation_key', inputKey.replace(/[%_]/g, '\\$&'))
                    .maybeSingle();

                if (keyRecord) {
                    isMatch = true;
                    // Mark as used if not already
                    if (!keyRecord.is_used) {
                        await db.from('activation_keys')
                            .update({ is_used: true, used_at: new Date().toISOString() })
                            .eq('id', keyRecord.id);
                    }
                }
            } catch (auditCheckErr) {
                // Non-critical
            }
        }

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid Student ID or Password / Activation Key.',
                message: 'Invalid Student ID or Password / Activation Key.'
            });
        }

        // ── Update last login timestamp ───────────────────────────────────────
        try {
            await db.from('students').update({
                updated_at: new Date().toISOString()
            }).eq('id', student.id);
        } catch (updateErr) {
            // Non-critical
        }

        // ── Resolve Bus & Route details for the mobile app ────────────────────
        const transitInfo = await resolveTransitInfo(student.route_id, null, student.route_name);

        // If student has a bus_number or route_id
        let busDetails = null;
        const targetBusNum = student.bus_number || transitInfo.bus_number;
        if (targetBusNum) {
            try {
                const { data: bData } = await schemaDb.transport
                    .from('buses')
                    .select('id, bus_number, vehicle_number, driver_name, driver_phone, status, route_name')
                    .eq('bus_number', targetBusNum)
                    .maybeSingle();
                if (bData) busDetails = bData;
            } catch (e) {
                // Non-critical
            }
        }

        const loginStudentData = {
            id: student.id,
            student_id: student.student_id,
            student_name: student.student_name,
            email: student.email || '',
            student_mobile: student.student_mobile || '',
            department: student.department || '',
            academic_year: student.academic_year || '1st Year',
            year: student.academic_year || '1st Year',
            route_id: student.route_id || transitInfo.route_id || null,
            route_name: transitInfo.route_name || busDetails?.route_name || student.route_name || null,
            bus_number: busDetails?.bus_number || student.bus_number || transitInfo.bus_number || null,
            vehicle_number: busDetails?.vehicle_number || transitInfo.vehicle_number || null,
            driver_name: busDetails?.driver_name || null,
            driver_phone: busDetails?.driver_phone || null,
            bus_status: busDetails?.status || null,
            is_registered: true
        };

        return res.status(200).json({
            success: true,
            message: 'Login successful!',
            student: loginStudentData,
            data: loginStudentData
        });

    } catch (err) {
        console.error('[Student Login] Server exception:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during login.',
            message: 'Internal server error during login.'
        });
    }
});

/**
 * 4. POST /api/students/forgot-password
 * ─────────────────────────────────────────────────────────────
 * Purpose: Allows students to request a new activation key using student_id or email.
 * Logic:
 *   - Finds student by ID or email.
 *   - Verifies email is registered.
 *   - Generates a new AM-XXXX activation key / reset token.
 *   - Updates Supabase student record and activation_keys audit table.
 *   - Sends the key securely to the student's email via Brevo HTTP API.
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const body = req.body || {};
        const cleanIdentifier = String(
            body.student_id ||
            body.studentId ||
            body.register_no ||
            body.roll_no ||
            body.id ||
            body.email ||
            body.identifier ||
            body.username ||
            ''
        ).trim();

        if (!cleanIdentifier) {
            return res.status(400).json({
                success: false,
                error: 'Please provide your Student ID or registered email address.',
                message: 'Please provide your Student ID or registered email address.'
            });
        }

        const db = getStudentDb();
        const isEmail = cleanIdentifier.includes('@');

        let query = db.from('students').select('*');
        if (isEmail) {
            query = query.ilike('email', cleanIdentifier.toLowerCase());
        } else {
            query = query.ilike('student_id', cleanIdentifier.replace(/[%_]/g, '\\$&'));
        }

        const { data: student, error: fetchError } = await query.maybeSingle();

        if (fetchError) {
            console.error('[Student Forgot Password] Supabase query error:', fetchError.message);
            return res.status(500).json({
                success: false,
                error: 'Internal server error looking up student record.',
                message: 'Internal server error looking up student record.'
            });
        }

        if (!student) {
            return res.status(404).json({
                success: false,
                error: 'No student record found matching the provided Student ID or email.',
                message: 'No student record found matching the provided Student ID or email.'
            });
        }

        if (!student.email || !student.email.trim()) {
            return res.status(400).json({
                success: false,
                error: 'No email address registered for this student. Please contact your transport administrator.',
                message: 'No email address registered for this student. Please contact your transport administrator.'
            });
        }

        // Generate new AM-XXXX activation key
        const newActivationKey = generateActivationKey();
        const nowIso = new Date().toISOString();

        // Update Supabase with new key
        const { error: updateError } = await db
            .from('students')
            .update({
                activation_key: newActivationKey,
                updated_at: nowIso
            })
            .eq('student_id', student.student_id);

        if (updateError) {
            console.error('[Student Forgot Password] Supabase update error:', updateError.message);
            return res.status(500).json({
                success: false,
                error: 'Failed to update activation key in database.',
                message: updateError.message
            });
        }

        // Record in activation_keys audit trail table
        try {
            await db.from('activation_keys').insert({
                student_id: student.student_id,
                activation_key: newActivationKey,
                key_type: 'forgot_password',
                is_used: false,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            });
        } catch (auditErr) {
            console.warn('[Student Forgot Password] Audit insert skipped:', auditErr.message);
        }

        // Send new key via Brevo HTTP API asynchronously in the background
        const masked = maskEmail(student.email);
        setImmediate(() => {
            sendActivationKeyEmail({
                email: student.email,
                name: student.student_name,
                student_name: student.student_name,
                studentId: student.student_id,
                activationKey: newActivationKey,
                type: 'forgot_password'
            }).catch(emailErr => {
                console.error('[Student Forgot Password] Background email sending failed:', emailErr.message);
            });
        });

        const message = `A new activation key has been sent to your registered email address (${masked}).`;

        return res.status(200).json({
            success: true,
            message: message,
            email_hint: masked,
            email_sent: true
        });

    } catch (err) {
        console.error('[Student Forgot Password] Server exception:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during password reset.',
            message: 'Internal server error during password reset.'
        });
    }
});

/**
 * 5. POST /api/students/reset-password
 * ─────────────────────────────────────────────────────────────
 * Purpose: Allows students to set a new password after receiving an activation key/token.
 * Inputs:  student_id (or email), current_key (or activation_key, token), new_password.
 */
router.post('/reset-password', async (req, res) => {
    try {
        const body = req.body || {};
        const cleanIdentifier = String(
            body.student_id ||
            body.studentId ||
            body.register_no ||
            body.roll_no ||
            body.id ||
            body.email ||
            body.identifier ||
            body.username ||
            ''
        ).trim();

        // Broaden key parsing to support all Flutter field conventions:
        const cleanKey = String(
            body.current_key ||
            body.activation_key ||
            body.activationKey ||
            body.token ||
            body.otp ||
            body.code ||
            body.key ||
            body.reset_token ||
            body.resetToken ||
            body.temp_password ||
            body.temporary_password ||
            body.current_password ||
            body.old_password ||
            body.oldPassword ||
            ''
        ).trim();

        // Gracefully map new_password or password:
        const hasExplicitKey = Boolean(
            body.current_key ||
            body.activation_key ||
            body.activationKey ||
            body.token ||
            body.otp ||
            body.code ||
            body.key ||
            body.reset_token ||
            body.resetToken ||
            body.temp_password ||
            body.temporary_password ||
            body.current_password ||
            body.old_password ||
            body.oldPassword
        );

        const cleanNewPassword = String(
            body.new_password ||
            body.newPassword ||
            (hasExplicitKey ? body.password : '') ||
            ''
        ).trim();

        if (!cleanIdentifier) {
            return res.status(400).json({
                success: false,
                error: 'Student ID or Email is required.',
                message: 'Student ID or Email is required.'
            });
        }

        if (!cleanKey) {
            return res.status(400).json({
                success: false,
                error: 'Current activation key, OTP, or reset token is required.',
                message: 'Current activation key, OTP, or reset token is required.'
            });
        }

        if (!cleanNewPassword || cleanNewPassword.length < 4) {
            return res.status(400).json({
                success: false,
                error: 'New password must be at least 4 characters long.',
                message: 'New password must be at least 4 characters long.'
            });
        }

        const db = getStudentDb();
        const isEmail = cleanIdentifier.includes('@');

        let query = db.from('students').select('*');
        if (isEmail) {
            query = query.ilike('email', cleanIdentifier.toLowerCase());
        } else {
            query = query.ilike('student_id', cleanIdentifier.replace(/[%_]/g, '\\$&'));
        }

        const { data: student, error: fetchError } = await query.maybeSingle();

        if (fetchError || !student) {
            return res.status(404).json({
                success: false,
                error: 'Student record not found.',
                message: 'Student record not found.'
            });
        }

        // Verify current key against primary student record
        const storedKey = String(student.activation_key || '').trim();
        let isMatch = verifyPassword(cleanKey, storedKey);

        // Fallback: check activation_keys audit trail table (just like login)
        if (!isMatch) {
            try {
                const { data: keyRecord } = await db
                    .from('activation_keys')
                    .select('*')
                    .eq('student_id', student.student_id)
                    .ilike('activation_key', cleanKey.replace(/[%_]/g, '\\$&'))
                    .maybeSingle();

                if (keyRecord) {
                    isMatch = true;
                    // Mark as used if not already
                    if (!keyRecord.is_used) {
                        await db.from('activation_keys')
                            .update({ is_used: true, used_at: new Date().toISOString() })
                            .eq('id', keyRecord.id);
                    }
                }
            } catch (auditCheckErr) {
                // Non-critical audit check
            }
        }

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid activation key, OTP, or reset token.',
                message: 'Invalid activation key, OTP, or reset token.'
            });
        }

        // Update password in students table
        const { error: updateError } = await db
            .from('students')
            .update({
                activation_key: cleanNewPassword,
                updated_at: new Date().toISOString()
            })
            .eq('id', student.id);

        if (updateError) {
            console.error('[Student Reset Password] Supabase update error:', updateError.message);
            return res.status(500).json({
                success: false,
                error: 'Failed to update new password.',
                message: updateError.message
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Password reset successfully! You can now sign in with your new password.'
        });

    } catch (err) {
        console.error('[Student Reset Password] Server exception:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error resetting password.',
            message: 'Internal server error resetting password.'
        });
    }
});

/**
 * 5a. GET /api/students/email-status
 * ─────────────────────────────────────────────────────────────
 * Purpose: Inspect Brevo HTTP REST API configuration status.
 */
router.get('/email-status', (req, res) => {
    try {
        const status = getBrevoStatus();
        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            email_service: status,
            brevo: status,
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message, message: err.message });
    }
});

/**
 * 5b. POST /api/students/test-email
 * ─────────────────────────────────────────────────────────────
 * Purpose: Test sending an email via Brevo HTTP REST API.
 * If API fails or encounters authorization issues, the Smart Fallback Logger prints the key to console.
 */
router.post('/test-email', async (req, res) => {
    try {
        const to = String(req.body?.to || req.query?.to || '').trim();
        if (!to || !to.includes('@')) {
            return res.status(400).json({
                success: false,
                error: 'Valid recipient email address is required in body ({ to: "email@example.com" }).',
                message: 'Valid recipient email address is required in body ({ to: "email@example.com" }).'
            });
        }

        const testKey = 'TEST-' + Math.floor(1000 + Math.random() * 9000);
        const result = await sendActivationKeyEmail({
            email: to,
            name: 'Test Student',
            studentId: 'TEST999',
            activationKey: testKey,
            type: 'registration',
        });

        return res.status(result.success ? 200 : 202).json({
            success: result.success,
            delivered: result.delivered,
            messageId: result.messageId || null,
            fallback_logged: Boolean(result.fallbackLogged),
            test_activation_key: testKey,
            message: result.delivered
                ? `Test email delivered successfully via Brevo HTTP API to ${to}!`
                : `Brevo email delivery failed (${result.error || 'Check logs'}). Activation key printed to server console via Smart Fallback Logger.`
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message, message: err.message });
    }
});


// ═════════════════════════════════════════════════════════════════════════
// 🔒 PROTECTED ADMIN ROUTES (REQUIRES SUPABASE JWT AUTHENTICATION)
// ═════════════════════════════════════════════════════════════════════════

/**
 * 6. GET /api/students
 * ─────────────────────────────────────────────────────────────
 * Purpose: Fetch all pre-loaded student records for the admin dashboard.
 * Supports: Chunked .range() pagination to bypass Supabase 1000-row limit.
 */
router.get('/', optionalAuthenticate, async (req, res) => {
    try {
        const db = getStudentDb();
        const requestedLimit = req.query.limit ? parseInt(req.query.limit, 10) : 10000;
        const CHUNK_SIZE = 1000;
        let allStudents = [];
        let from = 0;
        let hasMore = true;

        // Fetch transit metadata in parallel to enrich students with route_name and bus_number
        let routeMap = new Map();
        let busMap = new Map();
        try {
            const [routesRes, busesRes] = await Promise.all([
                schemaDb.transport.from('bus_routes').select('id, route_name, stops'),
                schemaDb.transport.from('buses').select('id, bus_number, vehicle_number, route_id, route_name')
            ]);
            if (routesRes.data) {
                routesRes.data.forEach(r => {
                    const stopMap = new Map();
                    let stopsList = [];
                    if (Array.isArray(r.stops)) {
                        stopsList = r.stops;
                    } else if (typeof r.stops === 'string') {
                        try {
                            stopsList = JSON.parse(r.stops);
                        } catch (_) { }
                    }
                    stopsList.forEach(st => {
                        if (st && st.id !== undefined) {
                            stopMap.set(String(st.id), st.stop_name || st.name || '');
                        }
                    });
                    routeMap.set(r.id, { ...r, stopMap });
                });
            }
            if (busesRes.data) {
                busesRes.data.forEach(b => {
                    busMap.set(b.id, b);
                    if (b.bus_number) {
                        const cleanNum = String(b.bus_number).trim();
                        busMap.set(`bus_${cleanNum}`, b);
                        busMap.set(cleanNum, b);
                    }
                    if (b.route_id && !busMap.has(`route_${b.route_id}`)) {
                        busMap.set(`route_${b.route_id}`, b);
                    }
                });
            }
        } catch (metaErr) {
            console.warn('[Students List] Transit metadata pre-fetch skipped:', metaErr.message);
        }

        while (hasMore) {
            const to = from + CHUNK_SIZE - 1;
            // Order by is_registered DESC first so registered students appear immediately at top,
            // then by updated_at DESC and created_at DESC
            // Query students_with_stops_view (PostgreSQL JOIN & LATERAL stop mapping)
            let { data, error } = await db
                .from('students_with_stops_view')
                .select('*')
                .order('is_registered', { ascending: false })
                .order('updated_at', { ascending: false, nullsFirst: false })
                .order('created_at', { ascending: false })
                .range(from, to);

            // Fallback to students table if the view is not yet created in the schema
            if (error || !data) {
                const stdQuery = await db
                    .from('students')
                    .select('*')
                    .order('is_registered', { ascending: false })
                    .order('updated_at', { ascending: false, nullsFirst: false })
                    .order('created_at', { ascending: false })
                    .range(from, to);
                data = stdQuery.data;
                error = stdQuery.error;
            }

            // Fallback if initial students query returned empty or error
            if ((error || !data || data.length === 0) && from === 0) {
                const pubRes = await adminSupabase
                    .from('students')
                    .select('*')
                    .order('is_registered', { ascending: false })
                    .order('updated_at', { ascending: false, nullsFirst: false })
                    .order('created_at', { ascending: false })
                    .range(from, to);
                if (pubRes.data) {
                    data = pubRes.data;
                    error = pubRes.error;
                }
            }

            if (error) {
                console.error('[Students List] Supabase error:', error.message);
                return res.status(400).json({ success: false, error: error.message, message: error.message });
            }

            if (data && data.length > 0) {
                allStudents = allStudents.concat(data);

                // Stop if returned batch is smaller than CHUNK_SIZE or reached requested limit
                if (data.length < CHUNK_SIZE || allStudents.length >= requestedLimit) {
                    hasMore = false;
                } else {
                    from += CHUNK_SIZE;
                }
            } else {
                hasMore = false;
            }
        }

        if (requestedLimit && allStudents.length > requestedLimit) {
            allStudents = allStudents.slice(0, requestedLimit);
        }

        const formattedStudents = allStudents.map(s => formatStudentRecord(s, routeMap, busMap));

        return res.status(200).json({
            success: true,
            total: formattedStudents.length,
            students: formattedStudents
        });
    } catch (err) {
        console.error('[Students List] Server exception:', err);
        return res.status(500).json({ success: false, error: 'Internal server error fetching students.', message: 'Internal server error fetching students.' });
    }
});

/**
 * 7. POST /api/students/import, POST /api/students/bulk, POST /api/students
 * ─────────────────────────────────────────────────────────────
 * Purpose: Admin bulk upload / pre-loading of student records.
 * Security: Protected with authenticate middleware (Admin only).
 */
router.post(['/import', '/bulk', '/'], authenticate, async (req, res) => {
    try {
        // Support both array (CSV/Bulk) and single object payload from frontend form
        const rawStudents = req.body.students || (Array.isArray(req.body) ? req.body : [req.body]);

        if (!Array.isArray(rawStudents) || rawStudents.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or empty students data provided.',
                message: 'Invalid or empty students data provided.'
            });
        }

        const isSingle = !req.body.students && !Array.isArray(req.body);

        // ── Strict Validation for Mandatory Fields ───────────────────
        if (isSingle) {
            const raw = rawStudents[0] || {};
            const rawId = String(raw.student_id || raw.register_no || '').trim();
            const rawName = String(raw.student_name || raw.name || raw.full_name || '').trim();
            const rawYear = String(raw.academic_year || raw.year || '').trim();

            if (!rawId) {
                return res.status(400).json({
                    success: false,
                    error: 'Student ID is required.',
                    message: 'Student ID is required.',
                    field: 'student_id'
                });
            }
            if (!rawName) {
                return res.status(400).json({
                    success: false,
                    error: 'Student Full Name is required.',
                    message: 'Student Full Name is required.',
                    field: 'student_name'
                });
            }
            if (!rawYear) {
                return res.status(400).json({
                    success: false,
                    error: 'Academic Year is required.',
                    message: 'Academic Year is required.',
                    field: 'academic_year'
                });
            }
        }

        const db = getStudentDb();
        const validCols = await getStudentColumns(db);

        // Format and prepare data matching valid database columns
        const formattedStudents = rawStudents.map(s => {
            const rawId = s.student_id || s.register_no || s.id;
            const studentId = rawId ? String(rawId).trim().toUpperCase() : `STD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const studentName = String(s.student_name || s.name || s.full_name || '').trim();
            const rawYear = s.academic_year || s.year || '1st Year';
            const cleanYear = String(rawYear).trim();

            // Optional fields: cleanly set to null if blank or not provided
            const dept = s.department && String(s.department).trim() ? String(s.department).trim() : null;
            const mobile = (s.student_mobile || s.phone || s.mobile) && String(s.student_mobile || s.phone || s.mobile).trim()
                ? String(s.student_mobile || s.phone || s.mobile).trim()
                : null;
            const rawEmail = (s.student_email || s.email) && String(s.student_email || s.email).trim()
                ? String(s.student_email || s.email).trim().toLowerCase()
                : null;
            const parentName = s.parent_name && String(s.parent_name).trim() ? String(s.parent_name).trim() : null;
            const parentPhone = s.parent_phone && String(s.parent_phone).trim() ? String(s.parent_phone).trim() : null;
            const routeId = (s.route_id !== undefined && s.route_id !== null && String(s.route_id).trim() !== '')
                ? parseInt(s.route_id, 10)
                : null;
            const stopId = (s.stop_id !== undefined && s.stop_id !== null && String(s.stop_id).trim() !== '')
                ? String(s.stop_id).trim()
                : null;

            const isRegistered = Boolean(rawEmail && rawEmail.includes('@'));

            const student = {
                student_id: studentId,
                student_name: studentName,
                department: dept,
                academic_year: cleanYear,
                year: cleanYear,
                pass_out_year: parseInt(s.pass_out_year || s.passout_year || s.pass_year, 10) || 2030,
                student_mobile: mobile,
                email: rawEmail,
                student_email: rawEmail,
                parent_name: parentName,
                parent_phone: parentPhone,
                route_id: routeId,
                stop_id: stopId,
                is_registered: isRegistered,
                activation_key: s.activation_key || Math.random().toString(36).substring(2, 10),
                updated_at: new Date().toISOString()
            };

            if (isRegistered) {
                student.registered_at = new Date().toISOString();
            }
            if (s.emergency_contact) student.emergency_contact = s.emergency_contact;
            if (s.bus_number || s.bus_no) student.bus_number = String(s.bus_number || s.bus_no).trim();
            if (s.boarding_stop || s.stop_name) student.boarding_stop = s.boarding_stop || s.stop_name;
            if (s.stop_name) student.stop_name = s.stop_name;

            // Filter to only valid database columns so PostgREST never errors on unknown columns
            return filterValidStudentColumns(student, validCols);
        });

        // ── Single Student Insert Protection ──────────────────────────
        if (isSingle) {
            const checkId = formattedStudents[0]?.student_id;
            if (checkId) {
                const { data: existingStudent } = await db
                    .from('students')
                    .select('id, student_id, student_name, academic_year')
                    .eq('student_id', checkId)
                    .maybeSingle();

                if (existingStudent) {
                    return res.status(409).json({
                        success: false,
                        error: `Student ID "${checkId}" already exists in the roster (${existingStudent.student_name}).`,
                        message: `Student ID "${checkId}" already exists in the roster (${existingStudent.student_name}).`,
                        duplicate: existingStudent
                    });
                }
            }
        }

        // ── Deduplicate in-memory by student_id to prevent Postgres conflict collision errors ──
        const seenBatchIds = new Set();
        const uniqueBatchStudents = [];
        const inBatchDuplicates = [];

        for (const s of formattedStudents) {
            if (seenBatchIds.has(s.student_id)) {
                inBatchDuplicates.push(s.student_id);
            } else {
                seenBatchIds.add(s.student_id);
                uniqueBatchStudents.push(s);
            }
        }

        // ── Check Existing Roster Records for Bulk Import ─────────────
        const skipDuplicates = req.body.skip_duplicates === true || req.body.skipDuplicates === true || !isSingle;
        let studentsToInsert = uniqueBatchStudents;
        let existingDuplicates = [];

        if (skipDuplicates && uniqueBatchStudents.length > 0) {
            const batchIds = uniqueBatchStudents.map(s => s.student_id);
            const { data: existingRecords } = await db
                .from('students')
                .select('id, student_id, student_name')
                .in('student_id', batchIds);

            if (existingRecords && existingRecords.length > 0) {
                const existingSet = new Set(existingRecords.map(r => r.student_id.toUpperCase()));
                existingDuplicates = existingRecords;
                studentsToInsert = uniqueBatchStudents.filter(s => !existingSet.has(s.student_id.toUpperCase()));
            }
        }

        const BATCH_SIZE = 500;
        let upsertedData = [];

        // Batch upserts to safely handle large CSV lists without PostgREST payload limits
        if (studentsToInsert.length > 0) {
            for (let i = 0; i < studentsToInsert.length; i += BATCH_SIZE) {
                const chunk = studentsToInsert.slice(i, i + BATCH_SIZE);
                const { data, error } = await db
                    .from('students')
                    .upsert(chunk, { onConflict: 'student_id' })
                    .select();

                if (error) {
                    console.error('[Student Import Batch] Supabase error:', error.message);
                    return res.status(400).json({ success: false, error: error.message, message: error.message });
                }
                if (data && data.length > 0) {
                    upsertedData = upsertedData.concat(data);
                } else {
                    upsertedData = upsertedData.concat(chunk);
                }
            }
        }

        let routeMap = new Map();
        try {
            const { data: rData } = await schemaDb.transport
                .from('bus_routes')
                .select('id, route_name, stops');
            if (rData) {
                rData.forEach(r => {
                    const stopMap = new Map();
                    const stopsList = Array.isArray(r.stops) ? r.stops : [];
                    stopsList.forEach(st => {
                        if (st && st.id !== undefined) {
                            stopMap.set(String(st.id), st.stop_name || st.name || '');
                        }
                    });
                    routeMap.set(r.id, { ...r, stopMap });
                });
            }
        } catch (_) { }

        const formattedOutput = upsertedData.map(s => formatStudentRecord(s, routeMap));
        const singleRecord = formattedOutput[0] || (studentsToInsert[0] ? formatStudentRecord(studentsToInsert[0], routeMap) : null);
        const totalSkipped = existingDuplicates.length + inBatchDuplicates.length;

        return res.status(200).json({
            success: true,
            message: isSingle
                ? 'Student registered successfully!'
                : `Successfully imported ${formattedOutput.length} student(s)!${totalSkipped > 0 ? ` (${totalSkipped} duplicate(s) skipped)` : ''}`,
            count: formattedOutput.length,
            data: isSingle ? singleRecord : formattedOutput,
            student: isSingle ? singleRecord : undefined,
            students: formattedOutput,
            skippedDuplicatesCount: totalSkipped,
            inBatchDuplicates,
            existingDuplicates
        });

    } catch (err) {
        console.error('[Student Import] Server exception:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during student registration.',
            message: 'Internal server error during student registration.'
        });
    }
});

/**
 * isions.
 */
router.put('/:id', optionalAuthenticate, async (req, res) => {
    try {
        const db = getStudentDb();
        const validCols = await getStudentColumns(db);
        const id = req.params.id;

        // 1. Locate existing student by primary key (id) or student_id
        const isNumeric = !isNaN(Number(id));
        let findQuery = db.from('students').select('*');
        if (isNumeric) {
            findQuery = findQuery.or(`id.eq.${id},student_id.eq.${id}`);
        } else {
            findQuery = findQuery.eq('student_id', id);
        }

        const { data: existingRows, error: findErr } = await findQuery;
        if (findErr || !existingRows || existingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student record not found.' });
        }

        const currentStudent = existingRows[0];
        const targetPk = currentStudent.id;
        const updates = { ...req.body };

        // 2. Normalize input field aliases
        delete updates.id;
        delete updates.section;
        delete updates.device_status;

        // Name
        if (updates.name && !updates.student_name) {
            updates.student_name = updates.name;
        }
        delete updates.name;

        // Student ID
        if (updates.register_no && !updates.student_id) {
            updates.student_id = updates.register_no;
        }
        delete updates.register_no;

        // Mobile / Phone
        if (updates.phone || updates.mobile) {
            if (!updates.student_mobile) {
                updates.student_mobile = updates.phone || updates.mobile;
            }
            delete updates.phone;
            delete updates.mobile;
        }

        // Academic Year normalization
        if (updates.year || updates.academic_year) {
            const rawYear = updates.academic_year || updates.year;
            const cleanYear = String(rawYear).trim();
            if (cleanYear === '1st Year' || cleanYear === '1' || cleanYear === 'I' || cleanYear.toLowerCase() === '1st') {
                updates.academic_year = '1.0';
            } else if (cleanYear === '2nd Year' || cleanYear === '2' || cleanYear === 'II' || cleanYear.toLowerCase() === '2nd') {
                updates.academic_year = '2.0';
            } else if (cleanYear === '3rd Year' || cleanYear === '3' || cleanYear === 'III' || cleanYear.toLowerCase() === '3rd') {
                updates.academic_year = '3.0';
            } else if (cleanYear === '4th Year' || cleanYear === '4' || cleanYear === 'IV' || cleanYear.toLowerCase() === '4th') {
                updates.academic_year = '4.0';
            } else {
                updates.academic_year = cleanYear;
            }
            delete updates.year;
        }

        // 3. Uniqueness validations against other student records
        // Student ID uniqueness check
        if (updates.student_id && String(updates.student_id).trim() !== String(currentStudent.student_id || '').trim()) {
            const cleanStudentId = String(updates.student_id).trim();
            const { data: idConflict } = await db
                .from('students')
                .select('id, student_id')
                .eq('student_id', cleanStudentId)
                .neq('id', targetPk)
                .maybeSingle();

            if (idConflict) {
                return res.status(409).json({
                    success: false,
                    error: `Student ID "${cleanStudentId}" is already assigned to another student.`,
                    message: `Student ID "${cleanStudentId}" is already assigned to another student.`
                });
            }
            updates.student_id = cleanStudentId;
        }

        // Email uniqueness check
        if (updates.email !== undefined && String(updates.email).trim() !== '') {
            const cleanEmail = String(updates.email).trim().toLowerCase();
            const currentEmail = String(currentStudent.email || '').trim().toLowerCase();

            if (cleanEmail !== currentEmail) {
                const { data: emailConflict } = await db
                    .from('students')
                    .select('id, email')
                    .eq('email', cleanEmail)
                    .neq('id', targetPk)
                    .maybeSingle();

                if (emailConflict) {
                    return res.status(409).json({
                        success: false,
                        error: `Email address "${cleanEmail}" is already registered to another student.`,
                        message: `Email address "${cleanEmail}" is already registered to another student.`
                    });
                }
            }
            updates.email = cleanEmail;
        }

        // 4. Resolve Route & Bus info if route_name, route_id, or stop_id was provided
        if (updates.route_name !== undefined || updates.route_id !== undefined || updates.stop_id !== undefined) {
            if (updates.route_id !== undefined) {
                updates.route_id = updates.route_id ? parseInt(updates.route_id, 10) : null;
            }
            if (updates.stop_id !== undefined) {
                updates.stop_id = updates.stop_id !== '' && updates.stop_id !== null ? String(updates.stop_id).trim() : null;
            }

            const transit = await resolveTransitInfo({
                routeName: updates.route_name,
                routeId: updates.route_id !== undefined ? updates.route_id : currentStudent.route_id,
                stopName: updates.stop_name || updates.boarding_stop || currentStudent.boarding_stop
            });

            if (transit.route_id) {
                updates.route_id = transit.route_id;
            }
            if (transit.bus_number) {
                updates.bus_number = transit.bus_number;
            }

            // If route and stop_id are present, resolve stop_name from bus_routes stops JSON
            const activeRouteId = updates.route_id !== undefined ? updates.route_id : currentStudent.route_id;
            const activeStopId = updates.stop_id !== undefined ? updates.stop_id : currentStudent.stop_id;

            if (activeRouteId && activeStopId) {
                try {
                    const { data: routeData } = await schemaDb.transport
                        .from('bus_routes')
                        .select('id, route_name, stops')
                        .eq('id', activeRouteId)
                        .maybeSingle();

                    if (routeData) {
                        updates.route_name = routeData.route_name;
                        let stops = [];
                        if (Array.isArray(routeData.stops)) stops = routeData.stops;
                        else if (typeof routeData.stops === 'string') {
                            try { stops = JSON.parse(routeData.stops); } catch (_) { }
                        }
                        const matched = stops.find(st => String(st.id) === String(activeStopId));
                        if (matched && matched.stop_name) {
                            updates.stop_name = matched.stop_name;
                            updates.boarding_stop = matched.stop_name;
                        }
                    }
                } catch (rErr) {
                    console.warn('[Student Update] Could not resolve stop name from route:', rErr.message);
                }
            }
        }

        // If email or activation_key set, ensure is_registered is true
        if (updates.email && updates.email.includes('@')) {
            updates.is_registered = true;
            if (!currentStudent.registered_at) {
                updates.registered_at = new Date().toISOString();
            }
        }

        // 5. Filter updates against verified Supabase columns
        const filteredUpdates = filterValidStudentColumns(updates, validCols);
        filteredUpdates.updated_at = new Date().toISOString();

        const { data, error } = await db
            .from('students')
            .update(filteredUpdates)
            .eq('id', targetPk)
            .select();

        if (error) {
            console.error('[Student Update] Supabase error:', error.message);
            if (error.code === '23505') {
                return res.status(409).json({
                    success: false,
                    error: 'A student with this Student ID or Email already exists.',
                    message: 'A student with this Student ID or Email already exists.'
                });
            }
            return res.status(400).json({ success: false, error: error.message, message: error.message });
        }

        // 6. Enrich formatted record with transit names
        let routeMap = new Map();
        let busMap = new Map();
        try {
            const [routesRes, busesRes] = await Promise.all([
                schemaDb.transport.from('bus_routes').select('id, route_name, stops'),
                schemaDb.transport.from('buses').select('id, bus_number, vehicle_number, route_id, route_name')
            ]);
            if (routesRes.data) {
                routesRes.data.forEach(r => {
                    const stopMap = new Map();
                    let stopsList = [];
                    if (Array.isArray(r.stops)) stopsList = r.stops;
                    else if (typeof r.stops === 'string') {
                        try { stopsList = JSON.parse(r.stops); } catch (_) { }
                    }
                    stopsList.forEach(st => {
                        if (st && st.id !== undefined) {
                            stopMap.set(String(st.id), st.stop_name || st.name || '');
                        }
                    });
                    routeMap.set(r.id, { ...r, stopMap });
                });
            }
            if (busesRes.data) {
                busesRes.data.forEach(b => {
                    busMap.set(b.id, b);
                    if (b.bus_number) busMap.set(`bus_${String(b.bus_number).trim()}`, b);
                    if (b.route_id) busMap.set(`route_${b.route_id}`, b);
                });
            }
        } catch (_) { }

        const updatedRecord = data?.[0] ? formatStudentRecord(data[0], routeMap, busMap) : null;

        return res.status(200).json({
            success: true,
            message: 'Student updated successfully',
            student: updatedRecord,
            data: updatedRecord
        });
    } catch (err) {
        console.error('[Student Update] Server exception:', err);
        return res.status(500).json({ success: false, error: 'Internal server error updating student.', message: 'Internal server error updating student.' });
    }
});

/**
 * 9. DELETE /api/students/:id
 * ─────────────────────────────────────────────────────────────
 * Purpose: Admin delete student record.
 */
router.delete('/:id', optionalAuthenticate, async (req, res) => {
    try {
        const db = getStudentDb();
        const id = req.params.id;

        const isNumeric = !isNaN(Number(id));
        const filter = isNumeric ? `id.eq.${id},student_id.eq.${id}` : `student_id.eq.${id}`;

        const { error } = await db
            .from('students')
            .delete()
            .or(filter);

        if (error) {
            console.error('[Student Delete] Supabase error:', error.message);
            return res.status(400).json({ success: false, error: error.message, message: error.message });
        }

        return res.status(200).json({ success: true, message: 'Student deleted successfully' });
    } catch (err) {
        console.error('[Student Delete] Server exception:', err);
        return res.status(500).json({ success: false, error: 'Internal server error deleting student.', message: 'Internal server error deleting student.' });
    }
});

module.exports = router;
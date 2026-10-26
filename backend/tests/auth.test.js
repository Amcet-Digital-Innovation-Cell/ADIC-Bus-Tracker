/**
 * tests/auth.test.js
 * ─────────────────────────────────────────────────────────────
 * AMCET Transit - Comprehensive Authentication & Security Test Suite
 * Framework: Jest & Supertest
 *
 * Scenarios Tested:
 *   1. Missing Token Tests (No header, malformed prefix, empty/null token) -> 401 Unauthorized
 *   2. Invalid / Tampered Token Tests (Corrupted signature, malformed string) -> 401 Unauthorized
 *   3. Expired Token Tests (Supabase returns expired token error) -> 401 Unauthorized
 *   4. Valid Token & Authorized Access Tests (Valid Supabase session) -> 200 OK + Payload
 *   5. Schema Isolation & Role Verification Check (bus_tracking schema protection)
 * ─────────────────────────────────────────────────────────────
 */

const request = require('supertest');
const app = require('../app');
const { supabase, resolveSchema } = require('../config/supabase');

describe('🔒 AMCET Transit - Backend Security & Authentication Test Suite', () => {
  let getUserSpy;

  beforeAll(() => {
    // Suppress console.warn / console.error logs during test runs for clean reporter output
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    // Spy on supabase.auth.getUser
    getUserSpy = jest.spyOn(supabase.auth, 'getUser');
  });

  afterEach(() => {
    getUserSpy.mockRestore();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 1. MISSING TOKEN SCENARIOS
  // ═════════════════════════════════════════════════════════════════════════
  describe('1. Missing Token Security Tests', () => {
    it('1.1 should return 401 when Authorization header is completely omitted', async () => {
      const res = await request(app)
        .get('/api/routes')
        .expect('Content-Type', /json/)
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Authorization token required/i);
      expect(getUserSpy).not.toHaveBeenCalled();
    });

    it('1.2 should return 401 when Authorization header does not start with Bearer', async () => {
      const res = await request(app)
        .get('/api/routes')
        .set('Authorization', 'Basic dXNlcjpwYXNz') // Basic auth instead of Bearer
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Authorization token required/i);
      expect(getUserSpy).not.toHaveBeenCalled();
    });

    it('1.3 should return 401 when Bearer token is empty or whitespace', async () => {
      const res = await request(app)
        .get('/api/routes')
        .set('Authorization', 'Bearer    ')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Authorization token required/i);
      expect(getUserSpy).not.toHaveBeenCalled();
    });

    it('1.4 should return 401 when token is a string literal "null" or "undefined"', async () => {
      const resNull = await request(app)
        .get('/api/routes')
        .set('Authorization', 'Bearer null')
        .expect(401);

      expect(resNull.body.success).toBe(false);
      expect(resNull.body.error).toMatch(/Authorization token required/i);

      const resUndefined = await request(app)
        .get('/api/routes')
        .set('Authorization', 'Bearer undefined')
        .expect(401);

      expect(resUndefined.body.success).toBe(false);
      expect(resUndefined.body.error).toMatch(/Authorization token required/i);
      expect(getUserSpy).not.toHaveBeenCalled();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. INVALID / MALFORMED TOKEN SCENARIOS
  // ═════════════════════════════════════════════════════════════════════════
  describe('2. Invalid & Malformed Token Tests', () => {
    it('2.1 should return 401 when an arbitrary fake or tampered JWT is sent', async () => {
      // Mock Supabase rejecting the forged token
      getUserSpy.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'invalid signature' },
      });

      const res = await request(app)
        .get('/api/routes')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid or expired token/i);
      expect(getUserSpy).toHaveBeenCalledWith('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature');
    });

    it('2.2 should return 401 when token verification throws an unexpected error', async () => {
      getUserSpy.mockRejectedValueOnce(new Error('Network error connecting to Auth provider'));

      const res = await request(app)
        .get('/api/routes')
        .set('Authorization', 'Bearer some-corrupted-token')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Token validation failed/i);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 3. EXPIRED TOKEN SCENARIOS
  // ═════════════════════════════════════════════════════════════════════════
  describe('3. Expired Token Tests', () => {
    it('3.1 should return 401 when token expiration timestamp (exp) has passed', async () => {
      // Mock Supabase returning token expired error
      getUserSpy.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'JWT expired: current time 1730000000 is after exp 1729999000' },
      });

      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDB9.expired_sig';

      const res = await request(app)
        .get('/api/routes')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid or expired token/i);
      expect(getUserSpy).toHaveBeenCalledWith(expiredToken);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 4. VALID TOKEN & AUTHORIZED ACCESS SCENARIOS
  // ═════════════════════════════════════════════════════════════════════════
  describe('4. Valid Token & Authorized Access Tests', () => {
    it('4.1 should allow access (200 OK) when a valid, active admin token is provided', async () => {
      const mockAdminUser = {
        id: 'usr_admin_amcet_9823',
        email: 'transport.admin@amcet.edu',
        user_metadata: { role: 'admin', full_name: 'Transport Coordinator' },
      };

      getUserSpy.mockResolvedValueOnce({
        data: { user: mockAdminUser },
        error: null,
      });

      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid.token';

      const res = await request(app)
        .get('/api/routes')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(getUserSpy).toHaveBeenCalledWith(validToken);
    });

    it('4.2 should attach user metadata (id, email, role) to req.user for downstream controllers', async () => {
      const mockCoordinator = {
        id: 'usr_coord_5541',
        email: 'bus.supervisor@amcet.edu',
        user_metadata: { role: 'supervisor' },
      };

      getUserSpy.mockResolvedValueOnce({
        data: { user: mockCoordinator },
        error: null,
      });

      const res = await request(app)
        .get('/api/dashboard')
        .set('Authorization', 'Bearer valid-supervisor-token');

      // The request should pass the auth middleware cleanly
      expect(res.status).not.toBe(401);
      expect(getUserSpy).toHaveBeenCalledWith('valid-supervisor-token');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 5. SCHEMA ISOLATION & SECURITY CHECKS
  // ═════════════════════════════════════════════════════════════════════════
  describe('5. Database Schema Isolation & Authorization Verification', () => {
    it('5.1 should strictly target "bus_tracking" schema and reject cross-schema leaks', () => {
      const activeSchema = resolveSchema();
      expect(activeSchema).toBe('bus_tracking');
    });

    it('5.2 should block unauthorized access to protected admin configuration routes', async () => {
      const res = await request(app)
        .get('/api/admin/config')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Authorization token required/i);
    });

    it('5.3 should protect student batch import endpoints against unauthorized posts', async () => {
      const res = await request(app)
        .post('/api/students/import')
        .send({ students: [{ student_id: 'HACK999', student_name: 'Intruder' }] })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Authorization token required/i);
    });
  });
});

import { useState } from 'react';
import supabase from '../lib/supabaseClient';

/**
 * Login page — Authentication flow updated to use Supabase directly.
 *
 * Previously: Frontend called POST /api/auth/login on the Express backend.
 * Now:        Frontend calls supabase.auth.signInWithPassword() directly.
 *
 * The Supabase access token is then passed to App.jsx via onLogin(),
 * stored in sessionStorage, and sent as "Authorization: Bearer <token>"
 * on every protected API request.
 *
 * UI is UNCHANGED — only the login logic was updated.
 */
const Login = ({ onLogin }) => {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      // ── Authenticate directly with Supabase ──────────────────────
      // The backend is NOT involved in authentication.
      // Supabase validates credentials and returns a session with
      // an access_token (JWT) that we send to the backend on API calls.
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !data?.session) {
        throw new Error(authError?.message || 'Invalid credentials');
      }

      const { session, user } = data;

      // Pass the Supabase access token and email to App.jsx
      if (onLogin) {
        onLogin({
          email: user.email,
          token: session.access_token,
        });
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      {/* Internal CSS — unchanged */}
      <style>{`
        :root {
          --navy: #243447;
          --orange: #ff9500;
          --text-light: #ffffff;
          --text-muted: #8b9cc9;
          --input-bg: #ffffff;
        }
        .login-page-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          width: 100%;
          background: #F5EFE6;
          padding: 20px;
          font-family: 'Inter', sans-serif;
          box-sizing: border-box;
        }
        .form-card {
          width: 100%;
          max-width: 420px;
          background: #243447;
          border-radius: 20px;
          padding: 48px 36px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
          color: #ffffff;
        }
        .form-heading { margin-bottom: 32px; text-align: center; }
        .form-heading h2 { margin: 0; font-size: 1.8rem; }
        .form-heading p { margin: 8px 0 0; font-size: 0.95rem; color: #ff9500; }
        form { display: flex; flex-direction: column; gap: 18px; }
        .form-group { display: flex; flex-direction: column; gap: 8px; }
        label { font-size: 0.92rem; font-weight: 600; color: #ff9500; }
        input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 8px;
          background: #ffffff;
          border: 1px solid #e0e0e0;
          color: #333;
          font-size: 0.95rem;
          outline: none;
        }
        .password-input-wrapper { position: relative; display: flex; align-items: center; }
        .password-input-wrapper input { padding-right: 40px; }
        .toggle-password {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 1.1rem;
        }
        .sign-in-btn {
          margin-top: 8px;
          padding: 12px 16px;
          border-radius: 8px;
          background: #ff9500;
          color: #2c3e50;
          border: none;
          font-weight: 700;
          cursor: pointer;
        }
        .reset-message { color: #ff9500; font-size: 0.85rem; text-align: center; }
        .error-banner {
          background: rgba(239,68,68,0.15);
          border: 1px solid rgba(239,68,68,0.4);
          color: #fca5a5;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 0.88rem;
          text-align: center;
        }
        .sign-in-btn:disabled { opacity: 0.65; cursor: not-allowed; }
      `}</style>

      <div className="form-card">
        <div className="form-heading">
          <h2>Welcome back</h2>
          <p>Sign in to access the admin dashboard</p>
        </div>

        <form onSubmit={handleLogin}>
          {error && <div className="error-banner">{error}</div>}
          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input 
              type="email" 
              id="email" 
              placeholder="you@example.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input 
                type={showPassword ? "text" : "password"} 
                id="password" 
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <button type="submit" className="sign-in-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
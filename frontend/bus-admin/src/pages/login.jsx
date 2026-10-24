import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import supabase from '../lib/supabaseClient';

/**
 * Login page — Authentication flow using Supabase directly.
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
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !data?.session) {
        throw new Error(authError?.message || 'Invalid credentials');
      }

      const { session, user } = data;

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
    <div className="login-page">
      <div className="login-card">

        {/* Brand header */}
        <div className="login-card__header">
          <h1 className="login-card__title">Welcome back</h1>
          <p className="login-card__subtitle">Sign in to access the admin dashboard</p>
        </div>

        <form className="login-form" onSubmit={handleLogin} noValidate>

          {/* Error banner */}
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          {/* Email field */}
          <div className="login-field">
            <label htmlFor="login-email" className="login-label">Email address</label>
            <input
              id="login-email"
              type="email"
              className="login-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {/* Password field */}
          <div className="login-field">
            <label htmlFor="login-password" className="login-label">Password</label>
            <div className="login-password-wrap">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="login-input login-input--password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-eye-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword
                  ? <EyeOff size={16} strokeWidth={2} />
                  : <Eye    size={16} strokeWidth={2} />
                }
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            id="sign-in-btn"
            type="submit"
            className="login-submit-btn"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

        </form>
      </div>

      {/* Inline styles scoped to login page */}
      <style>{`
        .login-page {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          width: 100%;
          background: #F0EDE8;
          padding: 20px;
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          background: #243447;
          border-radius: 22px;
          padding: 44px 36px 40px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.28), 0 6px 20px rgba(0,0,0,0.14);
          color: #ffffff;
        }

        .login-card__header {
          text-align: center;
          margin-bottom: 32px;
        }

        .login-card__title {
          font-size: 26px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: -0.02em;
          margin: 0 0 8px;
        }

        .login-card__subtitle {
          font-size: 13.5px;
          color: #ff9500;
          font-weight: 500;
          margin: 0;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .login-error {
          background: rgba(239,68,68,0.15);
          border: 1px solid rgba(239,68,68,0.4);
          color: #fca5a5;
          border-radius: 10px;
          padding: 11px 14px;
          font-size: 13px;
          text-align: center;
          line-height: 1.5;
        }

        .login-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .login-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #ff9500;
        }

        .login-input {
          width: 100%;
          height: 44px;
          padding: 0 14px;
          border-radius: 10px;
          background: #f7f9fc;
          border: 1.5px solid rgba(255,255,255,0.12);
          color: #1a202c;
          font-size: 14px;
          font-weight: 500;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
        }

        .login-input:hover {
          background: #edf2f7;
          border-color: rgba(255,255,255,0.2);
        }

        .login-input:focus {
          background: #ffffff;
          border-color: #ff9500;
          box-shadow: 0 0 0 3px rgba(255,149,0,0.18), inset 0 2px 4px rgba(0,0,0,0.04);
        }

        .login-input--password {
          padding-right: 44px;
        }

        .login-password-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .login-eye-btn {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          color: #9babc0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 6px;
          transition: color 0.15s ease;
        }

        .login-eye-btn:hover { color: #64748b; }

        .login-submit-btn {
          margin-top: 4px;
          height: 48px;
          width: 100%;
          border-radius: 12px;
          background: #ff9500;
          color: #1a2433;
          border: none;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.02em;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(255,149,0,0.35);
          transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease;
        }

        .login-submit-btn:hover {
          background: #e08600;
          box-shadow: 0 6px 20px rgba(255,149,0,0.45);
          transform: translateY(-1px);
        }

        .login-submit-btn:active {
          transform: scale(0.98);
          box-shadow: 0 2px 8px rgba(255,149,0,0.25);
        }

        .login-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
      `}</style>
    </div>
  );
};

export default Login;
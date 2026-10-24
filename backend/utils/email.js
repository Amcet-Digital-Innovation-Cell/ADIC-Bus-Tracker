/**
 * utils/email.js
 * ─────────────────────────────────────────────────────────────
 * Brevo (formerly Sendinblue) HTTP REST API Email Dispatcher.
 *
 * Replaces Nodemailer/SMTP with Brevo's HTTPS REST endpoint:
 *   POST https://api.brevo.com/v3/smtp/email
 *
 * Benefits:
 *   - No SMTP port blocking (uses standard HTTPS port 443 via axios)
 *   - Reliable delivery for student registration & activation keys
 *   - Fast execution with configurable HTTP timeout guards
 *   - Smart console fallback logger: when API is unreachable or
 *     unauthorized, activation keys are prominently output to the
 *     server console so local dev and testing are never blocked.
 *   - Branded, responsive HTML templates for AMCET Student Transit.
 * ─────────────────────────────────────────────────────────────
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const axios = require('axios');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Helper to parse sender email and name from environment variables
 */
function getEmailConfig() {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();

  // Support SENDER_EMAIL or fall back to EMAIL_FROM / SMTP_USER
  let senderEmail = (process.env.SENDER_EMAIL || '').trim();
  let senderName = (process.env.SENDER_NAME || 'AMCET Transport').trim();

  if (!senderEmail && process.env.EMAIL_FROM) {
    // Parse "Name" <email@domain.com> format if present
    const match = process.env.EMAIL_FROM.match(/<([^>]+)>/);
    if (match) {
      senderEmail = match[1].trim();
      const nameMatch = process.env.EMAIL_FROM.match(/^"?([^"<]+)"?\s*</);
      if (nameMatch && nameMatch[1]) {
        senderName = nameMatch[1].trim();
      }
    } else {
      senderEmail = process.env.EMAIL_FROM.trim();
    }
  }

  if (!senderEmail && process.env.SMTP_USER) {
    senderEmail = process.env.SMTP_USER.trim();
  }

  const isConfigured = Boolean(apiKey && senderEmail);

  return {
    apiKey,
    senderEmail,
    senderName,
    isConfigured,
  };
}

/**
 * Smart Fallback Logger:
 * Prominently logs student activation keys to the terminal when email delivery
 * fails or when credentials are not configured, ensuring testing/registration
 * is NEVER blocked.
 */
function logSmartFallback({ to, subject, studentId, activationKey, reason }) {
  console.log('\n════════════════════════════════════════════════════════════════════════════');
  console.log('  📬  [AMCET TRANSIT] SMART EMAIL FALLBACK — ACTIVATION KEY LOG');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log(`  Recipient  : ${to}`);
  if (studentId)     console.log(`  Student ID : ${studentId}`);
  if (activationKey) console.log(`  🔑 KEY     : ${activationKey}   <-- [USE THIS TO LOG IN / SIGN IN]`);
  console.log(`  Subject    : ${subject}`);
  console.log(`  Notice     : ${reason}`);
  console.log('  Status     : Registration / reset saved in database. Mobile app can proceed!');
  console.log('════════════════════════════════════════════════════════════════════════════\n');
}

/**
 * Generate a branded, responsive HTML email template for student activation keys
 */
function createActivationEmailTemplate({ name, studentId, activationKey, type }) {
  const isForgot = type === 'forgot_password';
  const title = isForgot ? 'New Mobile App Activation Key' : 'Welcome to AMCET Transport — Activation Key';
  const subtitle = isForgot
    ? 'A request was received to reset your student mobile app activation key.'
    : 'Your student registration for AMCET College Bus Tracking is confirmed!';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1e3a8a, #0284c7); padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 21px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0; font-size: 13.5px; opacity: 0.92; }
    .content { padding: 32px 28px; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    .lead { font-size: 14.5px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .key-box { background: #f8fafc; border: 2px dashed #0284c7; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0; }
    .key-label { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.8px; margin-bottom: 6px; }
    .key-value { font-size: 28px; font-weight: 800; color: #0f172a; font-family: 'Courier New', Courier, monospace; letter-spacing: 3px; }
    .info-list { background: #f8fafc; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; font-size: 13.5px; }
    .info-item { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
    .info-item:last-child { border-bottom: none; }
    .info-label { color: #64748b; }
    .info-val { font-weight: 600; color: #1e293b; }
    .instructions { font-size: 13.5px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .instructions ol { padding-left: 20px; margin: 8px 0; }
    .instructions li { margin-bottom: 6px; }
    .security-note { font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px; line-height: 1.5; }
    .footer { background: #f8fafc; padding: 18px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Annai Mira College of Engineering and Technology</h1>
      <p>AMCET Transport Management System 🚌</p>
    </div>
    <div class="content">
      <div class="greeting">Hello, ${name || 'Student'}!</div>
      <div class="lead">${subtitle}</div>

      <div class="info-list">
        <div class="info-item">
          <span class="info-label">Student ID:</span>
          <span class="info-val">${studentId}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Name:</span>
          <span class="info-val">${name || 'N/A'}</span>
        </div>
      </div>

      <div class="key-box">
        <div class="key-label">Your Mobile App Activation Key / Password</div>
        <div class="key-value">${activationKey}</div>
      </div>

      <div class="instructions">
        <strong>How to sign in to the Student Bus Tracking App:</strong>
        <ol>
          <li>Open the <strong>AMCET Student Transit</strong> mobile app.</li>
          <li>Enter your <strong>Student ID</strong>: <code>${studentId}</code></li>
          <li>Enter your <strong>Activation Key</strong>: <code>${activationKey}</code></li>
          <li>Tap <strong>Sign In</strong> to view live bus locations and routes.</li>
        </ol>
      </div>

      <div class="security-note">
        🔒 <em>Security notice:</em> Keep this activation key confidential. Do not share it with others. If you did not request this, please notify your transport administrator immediately.
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Annai Mira College of Engineering and Technology. All rights reserved.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generic sendEmail function using Brevo HTTP REST API via axios
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} [options.html] - HTML body
 * @param {string} [options.text] - Plain text fallback
 * @param {string} [options.name] - Recipient name
 * @param {string} [options.studentId] - Student ID (for smart fallback logger)
 * @param {string} [options.activationKey] - Activation Key / Password (for smart fallback logger)
 * @returns {Promise<{ success: boolean, delivered: boolean, messageId?: string, fallbackLogged?: boolean, error?: string }>}
 */
async function sendEmail({ to, subject, html, text, name, studentId, activationKey }) {
  const cleanTo = String(to || '').trim();
  if (!cleanTo || !cleanTo.includes('@')) {
    const errorMsg = `Invalid recipient email address: "${to}"`;
    console.error(`[Brevo API] ❌ ${errorMsg}`);
    return { success: false, delivered: false, error: errorMsg };
  }

  const { apiKey, senderEmail, senderName, isConfigured } = getEmailConfig();

  // If credentials are not configured, log to smart fallback and return gracefully
  if (!isConfigured) {
    const missing = [];
    if (!apiKey) missing.push('BREVO_API_KEY');
    if (!senderEmail) missing.push('SENDER_EMAIL');
    const errorMsg = `Brevo credentials not configured: missing ${missing.join(', ')} in .env`;
    console.warn(`[Brevo API] ⚠️ ${errorMsg}`);
    logSmartFallback({
      to: cleanTo,
      subject,
      studentId,
      activationKey,
      reason: errorMsg,
    });
    return { success: false, delivered: false, fallbackLogged: true, error: errorMsg };
  }

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [
      {
        email: cleanTo,
        name: name || cleanTo.split('@')[0],
      },
    ],
    subject: subject,
    htmlContent: html || `<p>${text || subject}</p>`,
  };

  if (text) {
    payload.textContent = text;
  }

  try {
    const response = await axios.post(BREVO_API_URL, payload, {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 10000, // 10s timeout guard
    });

    const messageId = response.data?.messageId || 'sent';
    console.log(`[Brevo API] ✅ Email delivered to ${cleanTo} via Brevo HTTP API (MessageId: ${messageId})`);
    return {
      success: true,
      delivered: true,
      messageId: messageId,
    };
  } catch (err) {
    const status = err.response?.status;
    const errData = err.response?.data;
    const errMsg = errData?.message || err.message;
    const errCode = errData?.code || err.code;

    console.error(`[Brevo API] ❌ Delivery failed for recipient ${cleanTo}:`, errMsg);

    if (status === 401 && errMsg && errMsg.includes('unrecognised IP address')) {
      console.warn('[Brevo API] 💡 IP Authorization Notice: Brevo requires IP whitelisting.');
      console.warn('   👉 Add your server IP at: https://app.brevo.com/security/authorised_ips');
    }

    // Trigger Smart Fallback Logger so testing / user login is NEVER blocked
    logSmartFallback({
      to: cleanTo,
      subject,
      studentId,
      activationKey,
      reason: `Brevo API HTTP ${status || 'Error'}: ${errMsg}`,
    });

    return {
      success: false,
      delivered: false,
      fallbackLogged: true,
      error: errMsg,
      code: errCode,
      status: status,
    };
  }
}

/**
 * Send Student Activation Key Email (Registration or Forgot Password)
 *
 * @param {Object} options
 * @param {string} options.email - Student recipient email address
 * @param {string} [options.student_name] - Student's full name
 * @param {string} [options.name] - Student's full name
 * @param {string} options.studentId - Student identifier (e.g. 23IT001)
 * @param {string} options.activationKey - Generated activation key (e.g. AM-XXXX)
 * @param {'registration'|'forgot_password'} [options.type='registration'] - Email context
 * @returns {Promise<{ success: boolean, delivered: boolean, messageId?: string, fallbackLogged?: boolean, error?: string }>}
 */
async function sendActivationKeyEmail({ email, student_name, name, studentId, activationKey, type = 'registration' }) {
  try {
    const isForgot = type === 'forgot_password';
    const resolvedName = student_name || name || 'Student';
    const subject = isForgot
      ? `AMCET Bus App: Your New Activation Key (${activationKey})`
      : `AMCET Bus App: Student Registration & Activation Key (${activationKey})`;

    const html = createActivationEmailTemplate({ name: resolvedName, studentId, activationKey, type });
    const text = `Hello ${resolvedName},\n\nYour AMCET Transport App Activation Key is: ${activationKey}\n\nStudent ID: ${studentId}\n\nOpen the AMCET mobile app and log in using your Student ID and Activation Key.\n\nKeep this key safe.\nAMCET Transport Team`;

    const result = await sendEmail({
      to: email,
      name: resolvedName,
      subject,
      html,
      text,
      studentId,
      activationKey,
    });

    return result;
  } catch (err) {
    console.error('[sendActivationKeyEmail] ❌ Top-level error:', err.message);
    logSmartFallback({
      to: email,
      subject: 'AMCET App Activation Key',
      studentId,
      activationKey,
      reason: `Unexpected error: ${err.message}`,
    });
    return {
      success: false,
      delivered: false,
      fallbackLogged: true,
      error: err.message,
    };
  }
}

/**
 * Verify Brevo API connection configuration at server boot.
 * Non-blocking check that verifies environment variables.
 */
async function verifyBrevoConnection() {
  const { apiKey, senderEmail, senderName, isConfigured } = getEmailConfig();

  if (!isConfigured) {
    console.warn('[Brevo API] ⚠️ BREVO_API_KEY or SENDER_EMAIL not set in backend/.env.');
    console.warn('[Brevo API] ℹ️ Smart fallback logger is active (activation keys will be logged to console).');
    return false;
  }

  const maskedKey = apiKey.length > 10 ? `${apiKey.slice(0, 10)}...${apiKey.slice(-4)}` : 'configured';
  console.log(`[Brevo API] ✅ Brevo REST API service configured (Sender: ${senderName} <${senderEmail}>, Key: ${maskedKey})`);
  return true;
}

/**
 * Returns Brevo email service status summary for diagnostic endpoints
 */
function getBrevoStatus() {
  const { senderEmail, senderName, isConfigured, apiKey } = getEmailConfig();
  return {
    provider: 'Brevo HTTP REST API',
    endpoint: BREVO_API_URL,
    configured: isConfigured,
    senderEmail: senderEmail || null,
    senderName: senderName || null,
    apiKeyConfigured: Boolean(apiKey),
    smartFallbackActive: true,
  };
}

module.exports = {
  sendEmail,
  sendActivationKeyEmail,
  verifyBrevoConnection,
  verifySmtpConnection: verifyBrevoConnection, // Backwards-compatibility alias
  getBrevoStatus,
  getSmtpStatus: getBrevoStatus,               // Backwards-compatibility alias
  getEmailDiagnostics: getBrevoStatus,        // Alias
  createActivationEmailTemplate,
};

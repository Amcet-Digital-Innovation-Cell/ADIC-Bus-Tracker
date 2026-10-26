/**
 * utils/sendEmail.js
 * ─────────────────────────────────────────────────────────────
 * Brevo HTTP API Email Dispatcher (Alias to utils/email.js)
 *
 * Fully replaces legacy Nodemailer SMTP with Brevo HTTP REST API.
 * Re-exports all functions from ./email.js for backward-compatibility.
 * ─────────────────────────────────────────────────────────────
 */

const emailService = require('./email');

module.exports = {
  ...emailService,
};

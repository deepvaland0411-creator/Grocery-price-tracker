const nodemailer = require("nodemailer");
const config = require("./config");

let transporter = null;

function getTransporter() {
  if (!config.smtpHost) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth:
        config.smtpUser && config.smtpPass
          ? { user: config.smtpUser, pass: config.smtpPass }
          : undefined,
    });
  }
  return transporter;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Notify the customer that an admin replied. Requires SMTP_* env vars.
 * @returns {{ sent: boolean, reason?: string, error?: string }}
 */
async function sendContactReplyEmail({
  to,
  firstName,
  subjectLabel,
  originalMessage,
  replyText,
}) {
  const transport = getTransporter();
  if (!transport) {
    console.warn("[mail] SMTP not configured (set SMTP_HOST in .env); reply email skipped.");
    return { sent: false, reason: "not_configured" };
  }

  const from = config.mailFrom || config.smtpUser;
  if (!from) {
    console.warn("[mail] Set MAIL_FROM or SMTP_USER; reply email skipped.");
    return { sent: false, reason: "no_from" };
  }

  const subj = `Re: ${subjectLabel} — GroceryTracker`;
  const text = [
    `Hi ${firstName || "there"},`,
    "",
    "Thank you for contacting GroceryTracker. Here is our reply:",
    "",
    replyText,
    "",
    "---",
    "Your original message:",
    originalMessage || "",
    "",
    "— GroceryTracker",
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(firstName || "there")},</p>
    <p>Thank you for contacting GroceryTracker. Here is our reply:</p>
    <blockquote style="border-left:3px solid #22c55e;padding-left:12px;margin:16px 0;">
      ${escapeHtml(replyText).replace(/\n/g, "<br>")}
    </blockquote>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#64748b;font-size:13px;"><strong>Your original message</strong></p>
    <p style="color:#334155;font-size:14px;white-space:pre-wrap;">${escapeHtml(originalMessage || "")}</p>
    <p style="margin-top:24px;color:#64748b;font-size:13px;">— GroceryTracker</p>
  `;

  try {
    await transport.sendMail({
      from,
      to,
      subject: subj,
      text,
      html,
      replyTo: from,
    });
    return { sent: true };
  } catch (err) {
    console.error("[mail] send failed:", err.message || err);
    return { sent: false, reason: "send_failed", error: err.message || String(err) };
  }
}

module.exports = { sendContactReplyEmail };

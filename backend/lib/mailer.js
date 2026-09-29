/* ============================================================
   SnapAssure — Secure Email Notification Service
   ------------------------------------------------------------
   Sends structured enquiry notifications to snapassure@gmail.com
   via Nodemailer. Uses credentials stored only in backend/.env.
   Provides rich HTML and plain-text formats with resilient error
   handling so enquiries are never dropped if delivery fails.
   ============================================================ */

const nodemailer = require("nodemailer");

function isMailerConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure = process.env.SMTP_SECURE === "false" ? false : (port === 465);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER ? process.env.SMTP_USER.trim() : "",
      pass: process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, "") : ""
    },
    // Set a reasonable connection timeout
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

/**
 * Generates the plain-text body matching the required user format.
 */
function buildPlainTextBody(enquiry) {
  return `New enquiry received from the website.

Name: ${enquiry.name}
Email: ${enquiry.email}
Phone: ${enquiry.phone}
Subject/Enquiry Type: ${enquiry.subject}
Message: ${enquiry.message}
Submitted: ${enquiry.formattedDate}

Additional Details:
Event Type: ${enquiry.eventType}
Event Date: ${enquiry.eventDate}
City / Location: ${enquiry.city}
Number of Guests: ${enquiry.guests}
Interested Experience: ${enquiry.experience}
Enquiry ID: ${enquiry.id}`;
}

/**
 * Generates an executive, branded HTML email for Gmail & modern clients.
 */
function buildHtmlBody(enquiry) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Website Enquiry</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; color: #f1f5f9; margin: 0; padding: 24px; }
    .card { max-width: 600px; margin: 0 auto; background: #131c2e; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .header { background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; color: #ffffff; letter-spacing: 0.5px; }
    .header p { margin: 6px 0 0; color: #ccfbf1; font-size: 14px; }
    .content { padding: 24px; }
    .intro { font-size: 15px; color: #94a3b8; margin-bottom: 20px; }
    .data-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .data-table td { padding: 10px 12px; border-bottom: 1px solid #1e293b; font-size: 14px; vertical-align: top; }
    .data-table td.label { color: #2dd4bf; font-weight: 600; width: 35%; }
    .data-table td.value { color: #f8fafc; }
    .message-box { background: #0f172a; border-left: 4px solid #2dd4bf; padding: 14px 16px; border-radius: 4px; margin-bottom: 24px; color: #e2e8f0; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
    .footer { padding: 16px 24px; background: #0a0f1d; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b; }
    .action-btn { display: inline-block; background: #0d9488; color: #ffffff !important; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 14px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>SnapAssure Interactive Booths</h1>
      <p>New Website Enquiry Notification</p>
    </div>
    <div class="content">
      <p class="intro">New enquiry received from the website.</p>
      
      <table class="data-table">
        <tr>
          <td class="label">Name:</td>
          <td class="value"><strong>${enquiry.name}</strong></td>
        </tr>
        <tr>
          <td class="label">Email:</td>
          <td class="value"><a href="mailto:${enquiry.email}" style="color: #38bdf8; text-decoration: none;">${enquiry.email}</a></td>
        </tr>
        <tr>
          <td class="label">Phone:</td>
          <td class="value"><a href="tel:${enquiry.phone}" style="color: #38bdf8; text-decoration: none;">${enquiry.phone}</a></td>
        </tr>
        <tr>
          <td class="label">Subject / Type:</td>
          <td class="value">${enquiry.subject}</td>
        </tr>
        <tr>
          <td class="label">Event Type:</td>
          <td class="value">${enquiry.eventType}</td>
        </tr>
        <tr>
          <td class="label">Event Date:</td>
          <td class="value">${enquiry.eventDate}</td>
        </tr>
        <tr>
          <td class="label">City / Location:</td>
          <td class="value">${enquiry.city}</td>
        </tr>
        <tr>
          <td class="label">Number of Guests:</td>
          <td class="value">${enquiry.guests}</td>
        </tr>
        <tr>
          <td class="label">Interested Experience:</td>
          <td class="value">${enquiry.experience}</td>
        </tr>
        <tr>
          <td class="label">Submitted:</td>
          <td class="value">${enquiry.formattedDate}</td>
        </tr>
      </table>

      <p style="margin: 0 0 8px; font-weight: 600; color: #94a3b8; font-size: 13px;">MESSAGE / REQUIREMENTS:</p>
      <div class="message-box">${enquiry.message}</div>

      <div style="text-align: center;">
        <a class="action-btn" href="mailto:${enquiry.email}?subject=Re:%20${encodeURIComponent(enquiry.subject)}%20-%20SnapAssure">Reply to ${enquiry.name}</a>
      </div>
    </div>
    <div class="footer">
      Enquiry ID: ${enquiry.id} • Sent automatically from SnapAssure website server
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends enquiry details to snapassure@gmail.com
 * @param {object} enquiry - Stored enquiry object
 * @returns {Promise<{ ok: boolean, error?: string, messageId?: string }>}
 */
async function sendEnquiryEmail(enquiry) {
  const recipient = process.env.EMAIL_TO || "snapassure@gmail.com";
  const subject = `New Website Enquiry – ${enquiry.name}`;

  if (!isMailerConfigured()) {
    if (process.env.USE_TEST_MAILER === "true" || process.env.SMTP_USER === "test") {
      try {
        const testAccount = await nodemailer.createTestAccount();
        const testTransporter = nodemailer.createTransport({
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
          auth: { user: testAccount.user, pass: testAccount.pass }
        });
        const info = await testTransporter.sendMail({
          from: `"SnapAssure Website" <${testAccount.user}>`,
          to: recipient,
          replyTo: `"${enquiry.name}" <${enquiry.email}>`,
          subject,
          text: buildPlainTextBody(enquiry),
          html: buildHtmlBody(enquiry)
        });
        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log(`[Mailer] Test email delivered for verification! Preview: ${previewUrl}`);
        return { ok: true, messageId: info.messageId, previewUrl };
      } catch (testErr) {
        console.warn(`[Mailer] Test mailer failed:`, testErr.message);
      }
    }

    const errorMsg = "SMTP credentials (SMTP_USER / SMTP_PASS) are not configured in backend/.env.";
    console.warn(`[Mailer] Cannot send email to ${recipient}: ${errorMsg}`);
    console.warn(`[Mailer] The enquiry (ID: ${enquiry.id}) is safely stored in backend/data/enquiries.json.`);
    return { ok: false, error: errorMsg };
  }

  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: `"SnapAssure Website" <${process.env.SMTP_USER}>`,
      to: recipient,
      replyTo: `"${enquiry.name}" <${enquiry.email}>`,
      subject,
      text: buildPlainTextBody(enquiry),
      html: buildHtmlBody(enquiry)
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Mailer] Email sent successfully to ${recipient} (Message ID: ${info.messageId})`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Mailer] Failed to send email to ${recipient}:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  sendEnquiryEmail,
  isMailerConfigured
};

// Sends the selection email to selected teams.
// Poster and Logo are hosted on reliable HTTPS CDN to display inline directly in the email body
// without bulky email attachments to maximize inbox deliverability.

const nodemailer = require('nodemailer');

// Permanent, high-speed CDN URLs for inline images:
const LOGO_URL = 'https://cdn.jsdelivr.net/gh/Manoj-kumar-01/Samartha@main/assets/samartha_logo.jpg';
const POSTER_URL = 'https://cdn.jsdelivr.net/gh/Manoj-kumar-01/Samartha@06da269/assets/samartha_poster.jpg';

const DELAY_MS = 1500; // Gap between emails to avoid spam/rate limit blocks

let transporter;
function getTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD missing in .env');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 1,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

const escapeHtml = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fill = (text, team) => {
  const teamLabel = team.id ? `${team.id} - ${team.name}` : (team.name || 'Participant');
  return String(text || '')
    .replace(/\{\{\s*team\s*\}\}/gi, teamLabel)
    .replace(/\{\{\s*college\s*\}\}/gi, team.college || '')
    .replace(/\{\{\s*theme\s*\}\}/gi, team.theme || 'Open Innovation')
    .replace(/\{\{\s*rank\s*\}\}/gi, String(team.rank || ''));
};

function buildHtml(message, team) {
  const bodyHtml = escapeHtml(fill(message, team)).replace(/\n/g, '<br>');
  const teamName = escapeHtml(team.id ? `${team.id} - ${team.name}` : (team.name || 'Participant'));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SAMARTHA 2026 Selection Confirmation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #050d08; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e6f4ed;">
  <!-- Full Width Background Wrapper -->
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #050d08; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- 1. Breaking News Announcement Banner (Outside on Top) -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin-bottom: 20px;">
          <tr>
            <td align="center">
              <img src="${POSTER_URL}" alt="SAMARTHA 2026 Shortlist Announcement" width="600" style="display: block; width: 100%; max-width: 600px; height: auto; border-radius: 12px; border: 1px solid #1f4730; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);">
            </td>
          </tr>
        </table>

        <!-- 2. Main SAMARTHA Green Card Container (Everything else stays inside) -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #0b1a12; border: 1px solid #183826; border-radius: 14px; overflow: hidden; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);">
          
          <!-- Header Bar: Logo + Event Branding -->
          <tr>
            <td align="center" style="background: linear-gradient(180deg, #10261b 0%, #0b1a12 100%); padding: 26px 20px; border-bottom: 1px solid #183826;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <img src="${LOGO_URL}" alt="SAMARTHA Logo" width="68" height="68" style="display: block; width: 68px; height: 68px; border-radius: 50%; border: 2px solid #00ff88; box-shadow: 0 0 16px rgba(0,255,136,0.3); margin-bottom: 12px;">
                    <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 2.5px; color: #00ff88; text-transform: uppercase;">SAMARTHA 2026</h1>
                    <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: 600; letter-spacing: 2px; color: #8ea89a; text-transform: uppercase;">Department of CSE // VIIT (Autonomous)</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Congratulatory Badge & Message Body -->
          <tr>
            <td style="padding: 24px 22px 20px 22px; line-height: 1.65; font-size: 15px; color: #d4e8dd;">
              <!-- Team Selection Notice (Consuming full comfortable width) -->
              <div style="background: linear-gradient(90deg, rgba(0, 255, 136, 0.12) 0%, rgba(0, 255, 136, 0.03) 100%); border: 1px solid #1a422c; border-radius: 8px; padding: 15px 18px; margin-bottom: 22px;">
                <p style="margin: 0; font-size: 15px; font-weight: 800; letter-spacing: 1px; color: #00ff88; text-transform: uppercase;">
                  ⚡ Team Selection Notice
                </p>
                <p style="margin: 6px 0 0 0; font-size: 14px; color: #b8d9c7;">
                  Recipient: <strong style="color: #ffffff; font-size: 15px;">${teamName}</strong>
                </p>
              </div>

              <!-- Customized Message Text -->
              <div style="font-size: 15px; color: #e1f2e8; line-height: 1.7;">
                ${bodyHtml}
              </div>
            </td>
          </tr>

          <!-- Footer Information -->
          <tr>
            <td align="center" style="background-color: #07120c; padding: 22px 24px; border-top: 1px solid #142e20; font-size: 12px; color: #6f8a7c; line-height: 1.6;">
              <p style="margin: 0; font-weight: 600; color: #8ea89a;">
                Vignan's Institute of Information Technology (Autonomous)
              </p>
              <p style="margin: 3px 0 0 0;">
                Department of Computer Science & Engineering • Beside VSEZ, Duvvada, Visakhapatnam - 530049
              </p>
              <p style="margin: 12px 0 0 0; font-size: 11px; color: #4d6859;">
                Official Hackathon Communication • SAMARTHA 2026
              </p>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #3b5245;">
                You are receiving this official update because your team registered for SAMARTHA 2026.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendViaBrevo(recipient, subject, text, html) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'SAMARTHA 2026 - VIIT', email: process.env.GMAIL_USER },
      to: [{ email: recipient.trim() }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Brevo HTTP Error (${res.status}): ${err.message || res.statusText}`);
  }
  return true;
}

async function sendViaResend(recipient, subject, text, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `SAMARTHA 2026 <${process.env.RESEND_FROM || 'onboarding@resend.dev'}>`,
      to: [recipient.trim()],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Resend HTTP Error (${res.status}): ${err.message || res.statusText}`);
  }
  return true;
}

async function sendSingleEmail(recipientEmail, team, subject, message) {
  const email = String(recipientEmail || '').trim();
  if (!email) throw new Error(`Invalid email address for team ${team.name || 'Unknown'}`);

  const filledSubject = fill(subject, team);
  const filledText = `${fill(message, team)}\n\n---\nSAMARTHA 2026 // Department of CSE, VIIT (Autonomous)\nContact: ${process.env.GMAIL_USER}`;
  const html = buildHtml(message, team);

  // 1. Cloud Host Fallback 1: Brevo HTTP API
  if (process.env.BREVO_API_KEY) {
    return sendViaBrevo(email, filledSubject, filledText, html);
  }

  // 2. Cloud Host Fallback 2: Resend HTTP API
  if (process.env.RESEND_API_KEY) {
    return sendViaResend(email, filledSubject, filledText, html);
  }

  // 3. Nodemailer SMTP (Default)
  return getTransporter().sendMail({
    from: `"SAMARTHA 2026 - VIIT" <${process.env.GMAIL_USER}>`,
    replyTo: process.env.GMAIL_USER,
    to: email,
    subject: filledSubject,
    text: filledText,
    html: html,
  });
}

async function sendOne(team, subject, message, overrideTo) {
  if (overrideTo) {
    const targets = overrideTo.split(',').map(e => e.trim()).filter(Boolean);
    if (!targets.length) throw new Error('No valid recipient email address specified');
    let lastResult;
    for (const email of targets) {
      lastResult = await sendSingleEmail(email, team, subject, message);
    }
    return lastResult;
  }

  const emails = team.emails && team.emails.length ? team.emails : [];
  if (!emails.length) throw new Error(`No recipient email address for team ${team.name}`);

  const results = [];
  for (const email of emails) {
    results.push(await sendSingleEmail(email, team, subject, message));
    if (emails.length > 1) {
      await new Promise(r => setTimeout(r, 600));
    }
  }
  return results;
}

// ---- Background bulk job (so the browser request doesn't time out) ----
const job = { running: false, total: 0, sent: 0, failed: [], done: false, startedAt: null };

function getJob() { return { ...job, failed: [...job.failed] }; }

async function sendBulk(teams, subject, message) {
  if (job.running) throw new Error('A send job is already running');
  const targets = teams.filter(t => t.emails && t.emails.length);
  const totalEmails = targets.reduce((sum, t) => sum + t.emails.length, 0);

  Object.assign(job, {
    running: true,
    total: totalEmails,
    sent: 0,
    failed: [],
    done: false,
    startedAt: Date.now(),
  });

  (async () => {
    for (const team of targets) {
      for (const email of team.emails) {
        try {
          await sendSingleEmail(email, team, subject, message);
          job.sent++;
        } catch (err) {
          job.failed.push({ team: `${team.name} (${email})`, error: err.message });
        }
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
    job.running = false;
    job.done = true;
  })();

  return { queued: totalEmails, teamsCount: targets.length, skippedNoEmail: teams.length - targets.length };
}

module.exports = { sendOne, sendBulk, getJob, buildHtml };

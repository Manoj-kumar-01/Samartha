require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware for parsing JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets (CSS, JS, images)
// This maps the current root folder for static files
app.use(express.static(path.join(__dirname))); 

// Secure MongoDB Connection using environment variable
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected securely via env'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Route 1: Spiderman Gateway Page
app.get('/', (req, res) => {
  res.render('spiderman', { title: 'SAMARTHA 2026 // Beyond the Multiverse' });
});

// Route 2: Main Hackathon Website
app.get(['/home', '/main'], (req, res) => {
  res.render('index', { title: 'SAMARTHA 2026 // 24-Hour Hackathon - VIIT CSE' });
});

// ---------- Selected Teams (public) ----------
const { getTeams, getPublicTeams } = require('./lib/teams');
const { sendOne, sendBulk, getJob, buildHtml } = require('./lib/mailer');

app.get('/selected-teams', async (req, res) => {
  try {
    const teams = await getPublicTeams();
    res.render('teams', { teams, error: null });
  } catch (err) {
    console.error('Selected teams load error:', err.message);
    res.render('teams', { teams: [], error: 'Team list is being updated. Please check back shortly.' });
  }
});

// ---------- Admin: bulk mail (password protected) ----------
function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: 'ADMIN_PASSWORD not set in .env' });
  if (req.get('x-admin-key') !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
  next();
}

app.get('/admin', (req, res) => res.render('admin'));

app.get('/admin/preview-mail', (req, res) => {
  const sample = { rank: 1, id: 'AV_001', name: 'ZenithX', college: "Vignan's Institute of Information Technology (VIIT)", theme: 'Generative AI & Agentic Workflows', emails: [] };
  const sampleMsg = `Dear Team {{team}},\n\nCongratulations! 🎉 Your team has been SELECTED for the SAMARTHA 2026 24-Hour Hackathon Finale, organised by the Department of CSE, Vignan's Institute of Information Technology (Autonomous).\n\n📅 Dates: October 10 – 11, 2026\n⏰ Reporting Time: 09:00 AM on October 10 (Hackathon starts at 10:00 AM sharp)\n📍 Venue: CSE Tech Labs, VIIT, Duvvada, Visakhapatnam\n🧩 Theme: {{theme}}\n\nSee you at Samartha! ⚡\n\nRegards,\nOrganizing Committee, SAMARTHA 2026\nDepartment of CSE, VIIT`;
  res.send(buildHtml(sampleMsg, sample));
});

app.get('/admin/api/teams', requireAdmin, async (req, res) => {
  try {
    res.json({ teams: await getTeams({ force: true }), sender: process.env.GMAIL_USER || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/test', requireAdmin, async (req, res) => {
  try {
    const { subject, message, to } = req.body;
    const teams = await getTeams();
    const sample = teams[0] || { rank: 1, name: 'Sample Team', college: 'Sample College', theme: 'Sample Theme', emails: [] };
    await sendOne(sample, subject, message, to || process.env.GMAIL_USER);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/send', requireAdmin, async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });
    res.json(await sendBulk(await getTeams({ force: true }), subject, message));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/api/status', requireAdmin, (req, res) => res.json(getJob()));

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

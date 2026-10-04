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
const { seedAndSyncDatabase } = require('./lib/syncDb');

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected securely via env');
    seedAndSyncDatabase().catch(e => console.warn('Atlas sync error:', e.message));
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    if (err.message.includes('ENOTFOUND')) {
      console.warn('⚠️ Atlas Hostname Notice: Ensure your MONGO_URI in .env contains your full cluster domain (e.g. cluster0.abcde.mongodb.net) and not just cluster0.mongodb.net.');
    }
  });

// Route 1: Spiderman Gateway Page
app.get('/', (req, res) => {
  res.render('spiderman', { title: 'SAMARTHA 2026 // Beyond the Multiverse' });
});

// Route 2: Main Hackathon Website
app.get(['/home', '/main'], (req, res) => {
  res.render('index', { title: 'SAMARTHA 2026 // 24-Hour Hackathon - VIIT CSE' });
});

// ---------- Selected Teams & Registration Storage ----------
const fs = require('fs');
const { getTeams, getPublicTeams } = require('./lib/teams');
const { sendOne, sendBulk, getJob, buildHtml } = require('./lib/mailer');

const backupFile = path.join(__dirname, 'data', 'payment_submissions.json');
function readLocalSubmissions() {
  try {
    if (fs.existsSync(backupFile)) {
      return JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function writeLocalSubmission(record) {
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    let list = readLocalSubmissions();
    const existingIdx = list.findIndex(s => s.teamId && s.teamId.toUpperCase() === record.teamId.toUpperCase());
    if (existingIdx !== -1) {
      list[existingIdx] = { ...list[existingIdx], ...record, updatedAt: new Date() };
    } else {
      list.unshift(record);
    }
    fs.writeFileSync(backupFile, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error('Failed to write local backup:', e.message);
  }
}

async function getRegisteredTeamMap() {
  const map = {};
  // 1. From local backup
  readLocalSubmissions().forEach(s => {
    if (s.teamId) {
      const id = s.teamId.toUpperCase();
      const attemptsAllowed = s.attemptsAllowed !== undefined ? Number(s.attemptsAllowed) : 1;
      const attemptsUsed = s.attemptsUsed !== undefined ? Number(s.attemptsUsed) : 1;
      const allowResubmit = s.allowResubmit === true;
      const isLocked = s.isLocked !== undefined ? s.isLocked : (attemptsUsed >= attemptsAllowed && !allowResubmit);
      const canSubmit = allowResubmit || !isLocked || (attemptsUsed < attemptsAllowed);

      map[id] = {
        teamId: s.teamId,
        teamName: s.teamName,
        submittedAt: s.submittedAt,
        status: s.status || 'pending',
        members: s.members || [],
        utrId: s.utrId,
        attemptsAllowed,
        attemptsUsed,
        isLocked,
        allowResubmit,
        canSubmit
      };
    }
  });

  // 2. From MongoDB Atlas
  if (mongoose.connection.readyState === 1) {
    try {
      const Payment = require('./models/Payment');
      const docs = await Payment.find({});
      docs.forEach(d => {
        if (d.teamId) {
          const id = d.teamId.toUpperCase();
          const attemptsAllowed = d.attemptsAllowed !== undefined ? Number(d.attemptsAllowed) : 1;
          const attemptsUsed = d.attemptsUsed !== undefined ? Number(d.attemptsUsed) : 1;
          const allowResubmit = d.allowResubmit === true;
          const isLocked = d.isLocked !== undefined ? d.isLocked : (attemptsUsed >= attemptsAllowed && !allowResubmit);
          const canSubmit = allowResubmit || !isLocked || (attemptsUsed < attemptsAllowed);

          map[id] = {
            teamId: d.teamId,
            teamName: d.teamName,
            submittedAt: d.submittedAt,
            status: d.status || 'pending',
            members: d.members || [],
            utrId: d.utrId,
            attemptsAllowed,
            attemptsUsed,
            isLocked,
            allowResubmit,
            canSubmit
          };
        }
      });
    } catch (e) {
      console.warn('MongoDB getRegisteredTeamMap note:', e.message);
    }
  }
  return map;
}

app.get('/selected-teams', async (req, res) => {
  try {
    const teams = await getPublicTeams();
    const registeredMap = await getRegisteredTeamMap();
    res.render('teams', { teams, registeredMap, error: null });
  } catch (err) {
    console.error('Selected teams load error:', err.message);
    res.render('teams', { teams: [], registeredMap: {}, error: 'Team list is being updated. Please check back shortly.' });
  }
});

app.get('/api/team-status/:teamId', async (req, res) => {
  try {
    const map = await getRegisteredTeamMap();
    const id = (req.params.teamId || '').toUpperCase();
    res.json({ registered: !!map[id], details: map[id] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// ---------- Payment & Roster Verification (Multer & MongoDB) ----------
const multer = require('multer');

const uploadsDir = path.join(__dirname, 'uploads', 'payments');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB limit
  fileFilter: function (req, file, cb) {
    const allowed = /jpeg|jpg|png|webp|pdf/;
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    const mime = file.mimetype.toLowerCase();
    if (allowed.test(ext) || allowed.test(mime)) {
      return cb(null, true);
    }
    cb(new Error('Only JPG, PNG, WEBP or PDF receipt files are allowed'));
  }
});

// Public API: Submit Payment & Team Roster
app.post('/api/payment/submit', (req, res) => {
  upload.single('screenshot')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ ok: false, error: err.message || 'File upload failed' });
    }

    try {
      const {
        teamId,
        teamName,
        teamLeadName,
        teamLeadEmail,
        teamLeadPhone,
        college,
        theme,
        member1Name,
        member1Email,
        member1Phone,
        member2Name,
        member2Email,
        member2Phone,
        member3Name,
        member3Email,
        member3Phone,
        utrId
      } = req.body;

      if (!teamId || !teamName || !teamLeadName || !teamLeadEmail) {
        return res.status(400).json({ ok: false, error: 'Please select a valid team from the shortlist before submitting.' });
      }

      // Check dynamic submission rule: each team has attemptsAllowed (default 1)
      const cleanTeamId = teamId.trim().toUpperCase();
      const registeredMap = await getRegisteredTeamMap();
      const existingEntry = registeredMap[cleanTeamId];

      if (existingEntry && !existingEntry.canSubmit) {
        return res.status(400).json({
          ok: false,
          error: `Registration for team [${teamId}] is locked (${existingEntry.attemptsUsed} of ${existingEntry.attemptsAllowed} attempt used). If you made a mistake, coordinators can unlock your squad directly in MongoDB Atlas.`
        });
      }

      if (!member1Name || !member2Name || !member3Name) {
        return res.status(400).json({ ok: false, error: 'Please enter details for all 3 squad members.' });
      }

      if (!utrId || utrId.trim().length < 6) {
        return res.status(400).json({ ok: false, error: 'Please enter a valid UPI / UTR Transaction ID (e.g. 12 digits).' });
      }

      const normalizedUtr = utrId.trim().toUpperCase();
      const localList = readLocalSubmissions();
      const duplicateUtrLocal = localList.find(s => s.utrId === normalizedUtr && s.teamId.toUpperCase() !== cleanTeamId);
      if (duplicateUtrLocal) {
        return res.status(400).json({ ok: false, error: 'This UPI / UTR Transaction ID has already been submitted by another team.' });
      }

      if (mongoose.connection.readyState === 1) {
        const Payment = require('./models/Payment');
        const existingUtr = await Payment.findOne({ utrId: normalizedUtr, teamId: { $ne: teamId.trim() } });
        if (existingUtr) {
          return res.status(400).json({ ok: false, error: 'This UPI / UTR Transaction ID has already been submitted by another team.' });
        }
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'Please upload your payment screenshot receipt.' });
      }

      const members = [
        { name: member1Name.trim(), email: (member1Email || '').trim(), phone: (member1Phone || '').trim() },
        { name: member2Name.trim(), email: (member2Email || '').trim(), phone: (member2Phone || '').trim() },
        { name: member3Name.trim(), email: (member3Email || '').trim(), phone: (member3Phone || '').trim() },
      ];

      const attemptsUsed = existingEntry ? (existingEntry.attemptsUsed + 1) : 1;
      const attemptsAllowed = existingEntry ? existingEntry.attemptsAllowed : 1;

      const record = {
        teamId: teamId.trim(),
        teamName: teamName.trim(),
        teamLeadName: teamLeadName.trim(),
        teamLeadEmail: teamLeadEmail.trim().toLowerCase(),
        teamLeadPhone: (teamLeadPhone || '').trim(),
        college: (college || '').trim(),
        theme: (theme || '').trim(),
        members,
        utrId: normalizedUtr,
        amount: 1000,
        screenshotData: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
        status: existingEntry ? existingEntry.status : 'pending',
        attemptsAllowed: attemptsAllowed,
        attemptsUsed: attemptsUsed,
        isLocked: true,
        allowResubmit: false,
        submittedAt: existingEntry && existingEntry.submittedAt ? existingEntry.submittedAt : new Date(),
        updatedAt: new Date(),
      };

      // 1. Resilient local backup
      writeLocalSubmission(record);

      // 2. MongoDB Atlas save / update
      let dbSaved = false;
      let docId = null;
      try {
        if (mongoose.connection.readyState === 1) {
          const Payment = require('./models/Payment');
          const Team = require('./models/Team');
          const savedDoc = await Payment.findOneAndUpdate(
            { teamId: record.teamId },
            { $set: record },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          await Team.findOneAndUpdate(
            { teamId: record.teamId },
            {
              $set: {
                registrationStatus: 'pending',
                members: record.members,
                payment: {
                  utrId: record.utrId,
                  amount: record.amount,
                  screenshotData: record.screenshotData
                },
                attemptsUsed: record.attemptsUsed,
                attemptsAllowed: record.attemptsAllowed,
                isLocked: true,
                allowResubmit: false,
                updatedAt: new Date()
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          docId = savedDoc._id;
          dbSaved = true;
        } else {
          console.log('ℹ️ MongoDB Atlas not currently connected (submission safely recorded in local store: data/payment_submissions.json)');
        }
      } catch (dbErr) {
        console.warn('⚠️ MongoDB Atlas note (saved to local backup):', dbErr.message);
      }

      return res.json({
        ok: true,
        message: 'Squad registration and payment verified successfully! Your submission is recorded.',
        teamId: record.teamId,
        teamName: record.teamName,
        utrId: record.utrId,
        submissionId: docId || record.teamId,
        savedToAtlas: dbSaved
      });
    } catch (serverErr) {
      console.error('Payment submit error:', serverErr);
      return res.status(500).json({ ok: false, error: 'Server error processing payment submission. Please try again.' });
    }
  });
});

// Admin APIs for managing payment submissions
app.get('/admin/api/payments', requireAdmin, async (req, res) => {
  try {
    let payments = [];
    try {
      const Payment = require('./models/Payment');
      payments = await Payment.find().sort({ submittedAt: -1 }).lean();
    } catch (e) {
      payments = readLocalSubmissions();
    }
    if (!payments || !payments.length) {
      payments = readLocalSubmissions();
    }
    res.json({ ok: true, payments });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/admin/api/payments/status', requireAdmin, async (req, res) => {
  try {
    const { id, status, notes } = req.body;
    try {
      const Payment = require('./models/Payment');
      await Payment.findByIdAndUpdate(id, { status, adminNotes: notes || '' });
    } catch (e) {}

    const list = readLocalSubmissions();
    const item = list.find(p => (p._id && p._id == id) || p.teamId == id || p.utrId == id);
    if (item) {
      item.status = status;
      if (notes) item.adminNotes = notes;
      fs.writeFileSync(backupFile, JSON.stringify(list, null, 2));
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

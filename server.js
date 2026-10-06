require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware for parsing JSON and form data (with generous payload limits)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Serve static assets (CSS, JS, images, uploads)
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Secure MongoDB Connection using environment variable
const { seedAndSyncDatabase, writeLocalSubmissionsList } = require('./lib/syncDb');

let lastMongoError = null;
let isConnecting = false;

function connectMongo() {
  if (!process.env.MONGO_URI) {
    lastMongoError = 'MONGO_URI environment variable is missing in process.env';
    console.warn('⚠️ MONGO_URI is missing. Local store fallback will be active.');
    return;
  }
  if (isConnecting || mongoose.connection.readyState === 1) return;
  isConnecting = true;

  const mongoOpts = {
    serverSelectionTimeoutMS: 8000, // Fail fast in 8s instead of 30s
    socketTimeoutMS: 45000,
    family: 4, // IPv4 preference to prevent Linux container IPv6 DNS delay
  };

  mongoose.connect(process.env.MONGO_URI, mongoOpts)
    .then(() => {
      lastMongoError = null;
      isConnecting = false;
      console.log('✅ MongoDB connected securely via env');
      seedAndSyncDatabase().catch(e => console.warn('Atlas sync note:', e.message));
    })
    .catch(err => {
      isConnecting = false;
      lastMongoError = err.message;
      console.error('❌ MongoDB connection error:', err.message);
      if (err.message.includes('ENOTFOUND')) {
        console.warn('⚠️ Atlas Hostname Notice: Ensure your MONGO_URI in .env contains your full cluster domain (e.g. cluster0.abcde.mongodb.net).');
      }
      if (err.message.includes('timed out') || err.message.includes('Could not connect to any servers')) {
        console.warn('⚠️ Atlas Network Access Notice: Ensure MongoDB Atlas -> Network Access has 0.0.0.0/0 (Allow access from anywhere) enabled so Render can connect.');
      }
      // Retry in 10s
      setTimeout(connectMongo, 10000);
    });
}

connectMongo();

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected. Retrying in 5s...');
  setTimeout(connectMongo, 5000);
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
const { getTeams, getPublicTeams } = require('./lib/teams');
const { sendOne, sendBulk, getJob, buildHtml } = require('./lib/mailer');

const backupFile = path.join(__dirname, 'data', 'payment_submissions.json');

function readLocalSubmissions() {
  try {
    if (fs.existsSync(backupFile)) {
      const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {}
  return [];
}

function writeLocalSubmission(record) {
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    let list = readLocalSubmissions();

    // Create a lightweight backup record (avoid massive base64 in json file)
    const cleanRecord = { ...record };
    if (cleanRecord.screenshotData && cleanRecord.screenshotData.length > 500) {
      cleanRecord.screenshotData = '[SAVED_IN_DATABASE]';
    }

    const existingIdx = list.findIndex(s => s.teamId && s.teamId.toUpperCase() === record.teamId.toUpperCase());
    if (existingIdx !== -1) {
      list[existingIdx] = { ...list[existingIdx], ...cleanRecord, updatedAt: new Date() };
    } else {
      list.unshift(cleanRecord);
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
      const canSubmit = allowResubmit || (!isLocked && attemptsUsed < attemptsAllowed);

      map[id] = {
        teamId: s.teamId,
        teamName: s.teamName,
        status: s.status || 'pending',
        utrId: s.utrId || '',
        maskedUtr: s.utrId ? ('••••••••' + s.utrId.slice(-4)) : '',
        members: (s.members || []).map(m => ({ name: m.name })),
        attemptsAllowed,
        attemptsUsed,
        isLocked,
        allowResubmit,
        canSubmit,
        submittedAt: s.submittedAt || null
      };
    }
  });

  // 2. From MongoDB Atlas (Both Payment and Team collections)
  if (mongoose.connection.readyState === 1) {
    try {
      const Payment = require('./models/Payment');
      const Team = require('./models/Team');

      // Exclude heavy screenshotData to prevent multi-megabyte transfers and memory spikes
      const docs = await Payment.find({}, '-screenshotData').lean();
      docs.forEach(d => {
        if (d.teamId) {
          const id = d.teamId.toUpperCase();
          const attemptsAllowed = d.attemptsAllowed !== undefined ? Number(d.attemptsAllowed) : 1;
          const attemptsUsed = d.attemptsUsed !== undefined ? Number(d.attemptsUsed) : 1;
          const allowResubmit = d.allowResubmit === true;
          const isLocked = d.isLocked !== undefined ? d.isLocked : (attemptsUsed >= attemptsAllowed && !allowResubmit);
          const canSubmit = allowResubmit || (!isLocked && attemptsUsed < attemptsAllowed);

          map[id] = {
            teamId: d.teamId,
            teamName: d.teamName,
            status: d.status || 'pending',
            utrId: d.utrId || '',
            maskedUtr: d.utrId ? ('••••••••' + d.utrId.slice(-4)) : '',
            members: (d.members || []).map(m => ({ name: m.name })),
            attemptsAllowed,
            attemptsUsed,
            isLocked,
            allowResubmit,
            canSubmit,
            submittedAt: d.submittedAt || null
          };
        }
      });

      // Also merge any status or registrations updated in Team collection
      const teamDocs = await Team.find(
        {
          $or: [
            { registrationStatus: { $in: ['pending', 'verified', 'completed', 'approved', 'rejected'] } },
            { 'payment.utrId': { $exists: true, $ne: '' } },
            { attemptsUsed: { $gt: 0 } }
          ]
        },
        '-payment.screenshotData'
      ).lean();

      teamDocs.forEach(t => {
        if (t.teamId) {
          const id = t.teamId.toUpperCase();
          const attemptsAllowed = t.attemptsAllowed !== undefined ? Number(t.attemptsAllowed) : 1;
          const attemptsUsed = t.attemptsUsed !== undefined ? Number(t.attemptsUsed) : 1;
          const allowResubmit = t.allowResubmit === true;
          const isLocked = t.isLocked !== undefined ? t.isLocked : (attemptsUsed >= attemptsAllowed && !allowResubmit);
          const canSubmit = allowResubmit || (!isLocked && attemptsUsed < attemptsAllowed);

          if (!map[id]) {
            map[id] = {
              teamId: t.teamId,
              teamName: t.teamName,
              status: t.registrationStatus || 'pending',
              utrId: t.payment?.utrId || '',
              maskedUtr: t.payment?.utrId ? ('••••••••' + t.payment.utrId.slice(-4)) : '',
              members: (t.members || []).map(m => ({ name: m.name })),
              attemptsAllowed,
              attemptsUsed,
              isLocked,
              allowResubmit,
              canSubmit,
              submittedAt: t.updatedAt || null
            };
          } else {
            if (t.registrationStatus && t.registrationStatus !== 'unregistered') {
              map[id].status = t.registrationStatus;
            }
            if (t.members && t.members.length) {
              map[id].members = t.members.map(m => ({ name: m.name }));
            }
          }
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

// Diagnostic & Health API (checks MongoDB status, counts, and errors)
app.get('/api/health', async (req, res) => {
  const stateNames = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const state = mongoose.connection.readyState;
  let paymentCount = 0;
  let teamCount = 0;
  if (state === 1) {
    try {
      const Payment = require('./models/Payment');
      const Team = require('./models/Team');
      paymentCount = await Payment.countDocuments();
      teamCount = await Team.countDocuments();
    } catch (e) {}
  }
  const localList = readLocalSubmissions();
  res.json({
    ok: true,
    mongo: {
      readyState: state,
      status: stateNames[state] || 'unknown',
      uriConfigured: !!process.env.MONGO_URI,
      lastError: lastMongoError
    },
    counts: {
      paymentsInDb: paymentCount,
      teamsInDb: teamCount,
      localBackups: localList.length
    },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ---------- Admin: bulk mail & payment portal (password protected) ----------
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit (comfortably under MongoDB 16MB document limit)
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase().replace('.', '');
    const mime = (file.mimetype || '').toLowerCase();
    
    // Check extension
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'heic', 'heif'];
    if (allowedExts.includes(ext)) {
      return cb(null, true);
    }

    // Check MIME
    if (
      mime.startsWith('image/') ||
      mime.includes('pdf') ||
      mime.includes('octet-stream') // Some mobile devices send PDFs as octet-stream
    ) {
      return cb(null, true);
    }

    cb(new Error('Only JPG, PNG, WEBP, HEIC, or PDF receipt files are allowed.'));
  }
});

// Public API: Submit Payment & Team Roster
app.post('/api/payment/submit', (req, res) => {
  upload.single('screenshot')(req, res, async (err) => {
    if (err) {
      console.warn('Multer upload error:', err.message);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ ok: false, error: 'Receipt file exceeds 10MB limit. Please upload a receipt screenshot under 10MB.' });
      }
      return res.status(400).json({ ok: false, error: err.message || 'File upload failed. Ensure the receipt is under 10MB.' });
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

      const cleanTeamId = teamId.trim().toUpperCase();
      const registeredMap = await getRegisteredTeamMap();
      const existingEntry = registeredMap[cleanTeamId];

      if (existingEntry && !existingEntry.canSubmit) {
        return res.status(400).json({
          ok: false,
          error: `Registration for team [${teamId}] is already completed and recorded in the database. If you need to make corrections, organizers can unlock your squad.`
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
        const existingUtr = await Payment.findOne({ utrId: normalizedUtr, teamId: { $ne: cleanTeamId } });
        if (existingUtr) {
          return res.status(400).json({ ok: false, error: 'This UPI / UTR Transaction ID has already been submitted by another team.' });
        }
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'Please upload your payment screenshot receipt.' });
      }

      // Save screenshot file to disk
      let savedFilePath = '';
      try {
        let fileExt = path.extname(req.file.originalname) || '';
        if (!fileExt) {
          fileExt = (req.file.mimetype || '').includes('pdf') ? '.pdf' : '.jpg';
        }
        const filename = `${cleanTeamId}_${Date.now()}${fileExt}`;
        const targetPath = path.join(uploadsDir, filename);
        fs.writeFileSync(targetPath, req.file.buffer);
        savedFilePath = `/uploads/payments/${filename}`;
      } catch (fErr) {
        console.warn('Physical file write note:', fErr.message);
      }

      // Determine proper MIME for base64 storage
      let fileMime = (req.file.mimetype || '').toLowerCase();
      if ((!fileMime || fileMime === 'application/octet-stream') && /\.pdf$/i.test(req.file.originalname)) {
        fileMime = 'application/pdf';
      }
      if (!fileMime) fileMime = 'image/jpeg';

      const members = [
        { name: member1Name.trim(), email: (member1Email || '').trim(), phone: (member1Phone || '').trim() },
        { name: member2Name.trim(), email: (member2Email || '').trim(), phone: (member2Phone || '').trim() },
        { name: member3Name.trim(), email: (member3Email || '').trim(), phone: (member3Phone || '').trim() },
      ];

      const attemptsUsed = existingEntry ? (existingEntry.attemptsUsed + 1) : 1;
      const attemptsAllowed = existingEntry ? Math.max(existingEntry.attemptsAllowed, attemptsUsed) : 1;

      const record = {
        teamId: cleanTeamId,
        teamName: teamName.trim(),
        teamLeadName: teamLeadName.trim(),
        teamLeadEmail: teamLeadEmail.trim().toLowerCase(),
        teamLeadPhone: (teamLeadPhone || '').trim(),
        college: (college || '').trim(),
        theme: (theme || '').trim(),
        members,
        utrId: normalizedUtr,
        amount: 1000,
        screenshotData: `data:${fileMime};base64,${req.file.buffer.toString('base64')}`,
        filePath: savedFilePath,
        status: existingEntry ? existingEntry.status : 'pending',
        attemptsAllowed: attemptsAllowed,
        attemptsUsed: attemptsUsed,
        isLocked: true,
        allowResubmit: false,
        submittedAt: existingEntry && existingEntry.submittedAt ? existingEntry.submittedAt : new Date(),
        updatedAt: new Date(),
      };

      // 1. Resilient local backup (clean JSON without huge string allocations)
      writeLocalSubmission(record);

      // 2. MongoDB Atlas save / update
      let dbSaved = false;
      let docId = null;
      try {
        if (mongoose.connection.readyState === 1) {
          const Payment = require('./models/Payment');
          const Team = require('./models/Team');

          const savedDoc = await Payment.findOneAndUpdate(
            { teamId: cleanTeamId },
            { $set: record },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
          );

          await Team.findOneAndUpdate(
            { teamId: cleanTeamId },
            {
              $set: {
                registrationStatus: record.status || 'pending',
                members: record.members,
                payment: {
                  utrId: record.utrId,
                  amount: record.amount,
                  verifiedAt: record.verifiedAt || null
                },
                attemptsUsed: record.attemptsUsed,
                attemptsAllowed: record.attemptsAllowed,
                isLocked: true,
                allowResubmit: false,
                updatedAt: new Date()
              }
            },
            { upsert: true, returnDocument: 'after' }
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
        status: record.status,
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
      if (mongoose.connection.readyState === 1) {
        const Payment = require('./models/Payment');
        payments = await Payment.find({}, '-screenshotData').sort({ submittedAt: -1 }).lean();
      }
    } catch (e) {
      console.warn('Admin payments fetch error:', e.message);
    }

    if (!payments || !payments.length) {
      payments = readLocalSubmissions().map(p => {
        const copy = { ...p };
        delete copy.screenshotData;
        return copy;
      });
    }

    res.json({ ok: true, payments });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin API to fetch receipt data on-demand (keeps table load super fast and memory low)
app.get('/admin/api/receipt/:teamId', requireAdmin, async (req, res) => {
  try {
    const cleanId = (req.params.teamId || '').toUpperCase();
    if (mongoose.connection.readyState === 1) {
      const Payment = require('./models/Payment');
      const doc = await Payment.findOne({ teamId: cleanId }, 'screenshotData filePath').lean();
      if (doc && doc.screenshotData && doc.screenshotData !== '[SAVED_IN_DATABASE]') {
        return res.json({ ok: true, screenshotData: doc.screenshotData, filePath: doc.filePath || '' });
      }
    }
    const local = readLocalSubmissions().find(p => p.teamId && p.teamId.toUpperCase() === cleanId);
    if (local && local.screenshotData && local.screenshotData !== '[SAVED_IN_DATABASE]') {
      return res.json({ ok: true, screenshotData: local.screenshotData, filePath: local.filePath || '' });
    }
    res.status(404).json({ ok: false, error: 'Receipt not found in database.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/admin/api/payments/status', requireAdmin, async (req, res) => {
  try {
    const { id, teamId, status, notes } = req.body;
    const cleanId = (teamId || '').toUpperCase();
    const Payment = require('./models/Payment');
    const Team = require('./models/Team');

    if (id) {
      await Payment.findByIdAndUpdate(id, { status, adminNotes: notes || '', updatedAt: new Date() });
    }
    if (cleanId) {
      await Payment.findOneAndUpdate({ teamId: cleanId }, { status, adminNotes: notes || '', updatedAt: new Date() });
      await Team.findOneAndUpdate({ teamId: cleanId }, { registrationStatus: status, adminNotes: notes || '', updatedAt: new Date() });
    }

    const list = readLocalSubmissions();
    const item = list.find(p => (p._id && p._id == id) || (p.teamId && p.teamId.toUpperCase() === cleanId) || p.utrId == id);
    if (item) {
      item.status = status;
      if (notes) item.adminNotes = notes;
      writeLocalSubmissionsList(list);
    }

    res.json({ ok: true, message: `Status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin API to unlock a squad for correction
app.post('/admin/api/payments/unlock', requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.body;
    if (!teamId) return res.status(400).json({ error: 'Team ID required' });
    const cleanId = teamId.trim().toUpperCase();

    const Payment = require('./models/Payment');
    const Team = require('./models/Team');

    await Payment.findOneAndUpdate(
      { teamId: cleanId },
      { allowResubmit: true, isLocked: false, $inc: { attemptsAllowed: 1 } }
    );
    await Team.findOneAndUpdate(
      { teamId: cleanId },
      { allowResubmit: true, isLocked: false, $inc: { attemptsAllowed: 1 } }
    );

    const list = readLocalSubmissions();
    const item = list.find(p => p.teamId && p.teamId.toUpperCase() === cleanId);
    if (item) {
      item.allowResubmit = true;
      item.isLocked = false;
      item.attemptsAllowed = (item.attemptsAllowed || 1) + 1;
      writeLocalSubmissionsList(list);
    }

    res.json({ ok: true, message: `Squad ${cleanId} unlocked for correction` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

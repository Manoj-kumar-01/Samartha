require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Helper to parse standard CSV
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

async function importSubmissions(csvFilePath) {
  if (!csvFilePath || !fs.existsSync(csvFilePath)) {
    console.error('❌ Please provide a valid CSV file path. Example: node scripts/import_google_form.js responses.csv');
    process.exit(1);
  }

  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB Atlas!');

  const Payment = require('../models/Payment');
  const Team = require('../models/Team');
  const { writeLocalSubmissionsList, readLocalSubmissions } = require('../lib/syncDb');

  const content = fs.readFileSync(csvFilePath, 'utf8');
  const rows = parseCsv(content);
  if (rows.length < 2) {
    console.error('❌ CSV file has no data rows.');
    process.exit(1);
  }

  const headers = rows[0].map(h => h.trim().toLowerCase());
  console.log('Headers found:', headers);

  // Flexible column matching
  const findCol = (...keywords) => {
    let idx = headers.findIndex(h => keywords.includes(h));
    if (idx !== -1) return idx;
    return headers.findIndex(h => keywords.some(k => h.includes(k)));
  };

  const idCol = findCol('team id', 'id', 'teamid');
  const nameCol = findCol('team name', 'team', 'teamname');
  const leadNameCol = findCol('team lead name', 'lead name', 'leader name');
  const leadEmailCol = findCol('team lead email', 'lead email', 'leader email', 'email address', 'email');
  const utrCol = findCol('utr', 'transaction id', 'reference', 'upi', 'payment id');
  const m1NameCol = findCol('member 1 name', 'member 2 name', 'member 1', 'member 2');
  const m2NameCol = findCol('member 2 name', 'member 3 name', 'member 3');
  const m3NameCol = findCol('member 3 name', 'member 4 name', 'member 4');

  const teams = await Team.find().lean();
  const teamIdMap = {};
  const teamEmailMap = {};
  const teamNameMap = {};
  teams.forEach(t => {
    if (t.teamId) teamIdMap[t.teamId.toUpperCase()] = t;
    if (t.teamLeadEmail) teamEmailMap[t.teamLeadEmail.toLowerCase()] = t;
    if (t.teamName) teamNameMap[t.teamName.trim().toLowerCase()] = t;
  });

  const localList = readLocalSubmissions();
  let importedCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawId = (idCol !== -1 ? row[idCol] : '').trim().toUpperCase();
    const rawEmail = (leadEmailCol !== -1 ? row[leadEmailCol] : '').trim().toLowerCase();
    const rawName = (nameCol !== -1 ? row[nameCol] : '').trim().toLowerCase();
    const utr = (utrCol !== -1 ? row[utrCol] : '').trim().toUpperCase();

    // Match team
    let matched = teamIdMap[rawId] || teamEmailMap[rawEmail] || teamNameMap[rawName];
    if (!matched) {
      console.warn(`⚠️ Row ${i + 1}: Could not match team (${rawId || rawEmail || rawName}). Skipping.`);
      continue;
    }

    const cleanTeamId = matched.teamId;
    const cleanTeamName = matched.teamName;

    const members = [];
    if (m1NameCol !== -1 && row[m1NameCol]) members.push({ name: row[m1NameCol].trim(), email: '', phone: '' });
    if (m2NameCol !== -1 && row[m2NameCol]) members.push({ name: row[m2NameCol].trim(), email: '', phone: '' });
    if (m3NameCol !== -1 && row[m3NameCol]) members.push({ name: row[m3NameCol].trim(), email: '', phone: '' });

    const submissionRecord = {
      teamId: cleanTeamId,
      teamName: cleanTeamName,
      teamLeadName: matched.teamLeadName,
      teamLeadEmail: matched.teamLeadEmail,
      teamLeadPhone: matched.teamLeadPhone || '',
      college: matched.college || '',
      theme: matched.theme || '',
      members,
      utrId: utr || ('IMPORTED_' + Date.now()),
      amount: 1000,
      screenshotData: '[IMPORTED_FROM_FORM]',
      filePath: '',
      status: 'pending',
      attemptsAllowed: 1,
      attemptsUsed: 1,
      isLocked: true,
      allowResubmit: false,
      submittedAt: new Date(),
      updatedAt: new Date()
    };

    // Upsert into Payment
    await Payment.findOneAndUpdate(
      { teamId: cleanTeamId },
      { $set: submissionRecord },
      { upsert: true }
    );

    // Upsert into Team
    await Team.findOneAndUpdate(
      { teamId: cleanTeamId },
      {
        $set: {
          registrationStatus: 'pending',
          members: submissionRecord.members,
          'payment.utrId': submissionRecord.utrId,
          'payment.amount': 1000,
          attemptsUsed: 1,
          isLocked: true,
          allowResubmit: false,
          updatedAt: new Date()
        }
      }
    );

    // Update local list
    const existingIdx = localList.findIndex(s => s.teamId && s.teamId.toUpperCase() === cleanTeamId);
    if (existingIdx !== -1) {
      localList[existingIdx] = { ...localList[existingIdx], ...submissionRecord };
    } else {
      localList.push(submissionRecord);
    }

    console.log(`✔ Imported Squad ${cleanTeamId} (${cleanTeamName}) — UTR: ${submissionRecord.utrId}`);
    importedCount++;
  }

  writeLocalSubmissionsList(localList);
  console.log(`\n🎉 Successfully imported ${importedCount} squad submissions into MongoDB Atlas & local backup!`);
  process.exit(0);
}

const targetFile = process.argv[2];
importSubmissions(targetFile).catch(err => {
  console.error('Import error:', err);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { getPublicTeams } = require('./teams');
const Team = require('../models/Team');
const Payment = require('../models/Payment');

const backupFile = path.join(__dirname, '..', 'data', 'payment_submissions.json');

function readLocalSubmissions() {
  try {
    if (fs.existsSync(backupFile)) {
      const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn('readLocalSubmissions note:', e.message);
  }
  return [];
}

function writeLocalSubmissionsList(list) {
  try {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(backupFile, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error('writeLocalSubmissionsList error:', e.message);
  }
}

async function seedAndSyncDatabase() {
  console.log('🔄 Starting Database Sync...');
  const teams = await getPublicTeams();

  // 1. Gather existing registrations from local backup
  const localList = readLocalSubmissions();
  const subMap = {};
  localList.forEach(s => {
    if (s.teamId) subMap[s.teamId.toUpperCase()] = s;
  });

  // 2. If MongoDB Atlas is connected, fetch existing registrations from Payment and Team collections
  if (mongoose.connection.readyState === 1) {
    try {
      // Exclude heavy screenshotData to prevent memory blowup
      const existingPayments = await Payment.find({}, '-screenshotData').lean();
      existingPayments.forEach(p => {
        if (p.teamId) {
          const id = p.teamId.toUpperCase();
          subMap[id] = {
            ...(subMap[id] || {}),
            teamId: p.teamId,
            teamName: p.teamName,
            teamLeadName: p.teamLeadName,
            teamLeadEmail: p.teamLeadEmail,
            teamLeadPhone: p.teamLeadPhone || '',
            college: p.college || '',
            theme: p.theme || '',
            status: p.status || 'pending',
            utrId: p.utrId,
            amount: p.amount || 1000,
            members: p.members || [],
            attemptsAllowed: p.attemptsAllowed !== undefined ? Number(p.attemptsAllowed) : 1,
            attemptsUsed: p.attemptsUsed !== undefined ? Number(p.attemptsUsed) : 1,
            isLocked: p.isLocked !== undefined ? p.isLocked : true,
            allowResubmit: p.allowResubmit === true,
            adminNotes: p.adminNotes || '',
            submittedAt: p.submittedAt || (subMap[id] ? subMap[id].submittedAt : new Date()),
            updatedAt: p.updatedAt || new Date()
          };
        }
      });

      const existingTeams = await Team.find(
        {
          $or: [
            { registrationStatus: { $in: ['pending', 'verified', 'completed', 'approved', 'rejected'] } },
            { 'payment.utrId': { $exists: true, $ne: '' } },
            { attemptsUsed: { $gt: 0 } }
          ]
        },
        '-payment.screenshotData'
      ).lean();

      existingTeams.forEach(t => {
        if (t.teamId) {
          const id = t.teamId.toUpperCase();
          if (!subMap[id]) {
            subMap[id] = {
              teamId: t.teamId,
              teamName: t.teamName,
              teamLeadName: t.teamLeadName,
              teamLeadEmail: t.teamLeadEmail,
              teamLeadPhone: t.teamLeadPhone || '',
              college: t.college || '',
              theme: t.theme || '',
              status: t.registrationStatus || 'pending',
              utrId: t.payment?.utrId || '',
              amount: t.payment?.amount || 1000,
              members: t.members || [],
              attemptsAllowed: t.attemptsAllowed !== undefined ? Number(t.attemptsAllowed) : 1,
              attemptsUsed: t.attemptsUsed !== undefined ? Number(t.attemptsUsed) : 1,
              isLocked: t.isLocked !== undefined ? t.isLocked : true,
              allowResubmit: t.allowResubmit === true,
              adminNotes: t.adminNotes || '',
              submittedAt: t.payment?.verifiedAt || t.updatedAt || new Date(),
              updatedAt: t.updatedAt || new Date()
            };
          } else {
            // Keep verified status if set in Team
            if (t.registrationStatus && t.registrationStatus !== 'unregistered') {
              subMap[id].status = t.registrationStatus;
            }
          }
        }
      });

      // Update local backup file with current Atlas state
      writeLocalSubmissionsList(Object.values(subMap));
      console.log(`💾 Local backup synced with ${Object.keys(subMap).length} submitted squads from Atlas.`);
    } catch (e) {
      console.warn('⚠️ Atlas pre-fetch note:', e.message);
    }
  }

  // 3. Upsert teams without overwriting existing registrations!
  if (mongoose.connection.readyState === 1) {
    console.log(`📦 Syncing ${teams.length} shortlisted teams with Atlas...`);
    let synced = 0;

    for (const t of teams) {
      const cleanId = (t.id || '').toUpperCase();
      const sub = subMap[cleanId];

      const setFields = {
        rank: t.rank || 0,
        teamName: t.name,
        teamLeadName: t.leadName,
        teamLeadEmail: t.leadEmail,
        teamLeadPhone: t.leadPhone,
        college: t.college,
        theme: t.theme || '',
        updatedAt: new Date()
      };

      const setOnInsertFields = {
        createdAt: new Date()
      };

      if (sub) {
        // PRESERVE or UPDATE registration details
        setFields.registrationStatus = sub.status || 'pending';
        setFields.members = sub.members || [];
        setFields.payment = {
          utrId: sub.utrId || '',
          amount: sub.amount || 1000,
          verifiedAt: sub.verifiedAt || null
        };
        setFields.attemptsAllowed = sub.attemptsAllowed !== undefined ? Number(sub.attemptsAllowed) : 1;
        setFields.attemptsUsed = sub.attemptsUsed !== undefined ? Number(sub.attemptsUsed) : 1;
        setFields.isLocked = sub.isLocked !== undefined ? sub.isLocked : true;
        setFields.allowResubmit = sub.allowResubmit === true;
        if (sub.adminNotes) setFields.adminNotes = sub.adminNotes;
        if (sub.submittedAt) setFields.submittedAt = sub.submittedAt;
      } else {
        // Only set default registration fields on INSERT, so existing registrations are never touched!
        setOnInsertFields.registrationStatus = 'unregistered';
        setOnInsertFields.members = [];
        setOnInsertFields.payment = { utrId: '', amount: 1000, screenshotData: '', verifiedAt: null };
        setOnInsertFields.attemptsAllowed = 1;
        setOnInsertFields.attemptsUsed = 0;
        setOnInsertFields.isLocked = false;
        setOnInsertFields.allowResubmit = false;
      }

      await Team.findOneAndUpdate(
        { teamId: cleanId },
        { 
          $set: setFields,
          $setOnInsert: setOnInsertFields
        },
        { upsert: true, returnDocument: 'after' }
      );

      synced++;
    }

    console.log(`🎉 Successfully synced ${synced} teams into MongoDB Atlas (registrations strictly preserved)!`);
  }

  return teams;
}

module.exports = { seedAndSyncDatabase, readLocalSubmissions, writeLocalSubmissionsList };

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
      return JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    }
  } catch (e) {}
  return [];
}

async function seedAndSyncDatabase() {
  console.log('🔄 Starting Database Sync...');
  const teams = await getPublicTeams();
  const submissions = readLocalSubmissions();
  const subMap = {};
  submissions.forEach(s => {
    if (s.teamId) subMap[s.teamId.toUpperCase()] = s;
  });

  const fullDocuments = teams.map(t => {
    const cleanId = (t.id || '').toUpperCase();
    const sub = subMap[cleanId];

    return {
      teamId: t.id,
      rank: t.rank || 0,
      teamName: t.name,
      teamLeadName: t.leadName,
      teamLeadEmail: t.leadEmail,
      teamLeadPhone: t.leadPhone,
      college: t.college,
      theme: t.theme || '',
      registrationStatus: sub ? (sub.status || 'pending') : 'unregistered',
      members: sub && sub.members ? sub.members : [],
      payment: {
        utrId: sub ? (sub.utrId || '') : '',
        amount: sub ? (sub.amount || 1000) : 1000,
        screenshotData: sub ? (sub.screenshotData || '') : '',
        verifiedAt: sub && sub.verifiedAt ? sub.verifiedAt : null
      },
      attemptsAllowed: sub && sub.attemptsAllowed !== undefined ? sub.attemptsAllowed : 1,
      attemptsUsed: sub && sub.attemptsUsed !== undefined ? sub.attemptsUsed : 0,
      isLocked: sub && sub.isLocked !== undefined ? sub.isLocked : false,
      allowResubmit: sub && sub.allowResubmit !== undefined ? sub.allowResubmit : false,
      adminNotes: sub && sub.adminNotes ? sub.adminNotes : '',
      submittedAt: sub && sub.submittedAt ? sub.submittedAt : null,
      updatedAt: new Date()
    };
  });

  // If MongoDB is connected, upsert all 100 team documents into Atlas
  if (mongoose.connection.readyState === 1) {
    console.log(`📦 MongoDB Atlas connected! Upserting all ${fullDocuments.length} team documents...`);
    let synced = 0;
    for (const doc of fullDocuments) {
      await Team.findOneAndUpdate(
        { teamId: doc.teamId },
        { $set: doc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (doc.registrationStatus !== 'unregistered') {
        await Payment.findOneAndUpdate(
          { teamId: doc.teamId },
          { $set: doc },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
      synced++;
    }
    console.log(`🎉 Successfully synced ${synced} complete documents into MongoDB Atlas!`);
  } else {
    console.log('ℹ️ MongoDB Atlas currently disconnected. All documents prepared for instant sync upon connection.');
  }

  return fullDocuments;
}

module.exports = { seedAndSyncDatabase, readLocalSubmissions };

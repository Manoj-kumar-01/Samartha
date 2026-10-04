require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { getPublicTeams } = require('../lib/teams');
const Team = require('../models/Team');
const Payment = require('../models/Payment');
const { readLocalSubmissions } = require('../lib/syncDb');

async function main() {
  console.log('====================================================');
  console.log('  SAMARTHA 2026 - MONGODB ATLAS SEEDER & SYNC TOOL  ');
  console.log('====================================================\n');

  const uri = process.env.MONGO_URI;
  console.log(`🔍 Checking MONGO_URI in .env...`);
  if (!uri) {
    console.error('❌ Error: MONGO_URI is missing in .env file.');
    process.exit(1);
  }

  // Diagnostic check on cluster domain
  if (uri.includes('@cluster0.mongodb.net')) {
    console.warn('\n⚠️  WARNING: POTENTIAL ATLAS HOSTNAME ISSUE DETECTED');
    console.warn('Your URI currently points to: cluster0.mongodb.net');
    console.warn('In MongoDB Atlas, cluster hostnames include a 5-7 character cluster subdomain,');
    console.warn('e.g.: mongodb+srv://username:password@cluster0.abcde.mongodb.net/samartha');
    console.warn('If connection fails with ENOTFOUND, please copy the exact URI from your Atlas Dashboard (Connect -> Drivers).\n');
  }

  // 1. Prepare entire 100-team document dataset
  console.log('📦 Gathering all 100 shortlisted teams and local squad submissions...');
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
        screenshotPath: sub ? (sub.screenshotPath || '') : '',
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

  // Save full JSON snapshot
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const snapshotPath = path.join(dataDir, 'atlas_seed_documents.json');
  fs.writeFileSync(snapshotPath, JSON.stringify(fullDocuments, null, 2));
  console.log(`✅ Structured ${fullDocuments.length} complete team documents.`);
  console.log(`📁 Saved snapshot to: ${snapshotPath}\n`);

  // 2. Connect to MongoDB Atlas
  console.log('🔌 Connecting to MongoDB Atlas...');
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log('✅ Connected to MongoDB Atlas successfully!\n');

    console.log('🚀 Upserting all documents into "teams" and "payments" collections...');
    let teamCount = 0;
    let paymentCount = 0;

    for (const doc of fullDocuments) {
      await Team.findOneAndUpdate(
        { teamId: doc.teamId },
        { $set: doc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      teamCount++;

      if (doc.registrationStatus !== 'unregistered') {
        await Payment.findOneAndUpdate(
          { teamId: doc.teamId },
          { $set: doc },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        paymentCount++;
      }
    }

    console.log(`\n🎉 SEED SUCCESSFUL!`);
    console.log(`   - Teams Collection: ${teamCount} documents synced.`);
    console.log(`   - Payments Collection: ${paymentCount} submitted squad records synced.`);
    console.log(`\nYour MongoDB Atlas database now contains the entire dataset with full schemas.\n`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ MongoDB Connection Failed:', err.message);
    if (err.message.includes('ENOTFOUND')) {
      console.error('\n👉 REASON: The cluster hostname in your URI was not found by DNS.');
      console.error('   Please check MongoDB Atlas (https://cloud.mongodb.com):');
      console.error('   1. Click "Database" -> "Connect" -> "Drivers" (Node.js).');
      console.error('   2. Copy the URI containing your exact cluster hash (e.g. cluster0.abcde.mongodb.net).');
      console.error('   3. Update MONGO_URI in .env and run: npm run seed-db\n');
    } else if (err.message.includes('bad auth') || err.message.includes('Authentication failed')) {
      console.error('\n👉 REASON: Invalid username or password in MONGO_URI.');
      console.error('   Check Database Access in Atlas to confirm your credentials.\n');
    } else if (err.message.includes('IP') || err.message.includes('whitelist')) {
      console.error('\n👉 REASON: Network Access IP restriction.');
      console.error('   In Atlas -> Network Access -> Add IP Address -> Add Current IP or 0.0.0.0/0.\n');
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

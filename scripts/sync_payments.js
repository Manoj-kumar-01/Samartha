require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const backupFile = path.join(__dirname, '..', 'data', 'payment_submissions.json');

async function syncPaymentsFromAtlas() {
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected!');

  const Payment = require('../models/Payment');
  const Team = require('../models/Team');

  const payments = await Payment.find().lean();
  console.log(`Found ${payments.length} payment records in MongoDB Atlas.`);

  // Prepare clean local backup records
  const backupList = payments.map(p => ({
    teamId: p.teamId,
    teamName: p.teamName,
    teamLeadName: p.teamLeadName,
    teamLeadEmail: p.teamLeadEmail,
    teamLeadPhone: p.teamLeadPhone || '',
    college: p.college || '',
    theme: p.theme || '',
    members: p.members || [],
    utrId: p.utrId,
    amount: p.amount || 1000,
    status: p.status || 'pending',
    attemptsAllowed: p.attemptsAllowed || 1,
    attemptsUsed: p.attemptsUsed || 1,
    isLocked: p.isLocked !== undefined ? p.isLocked : true,
    allowResubmit: p.allowResubmit === true,
    adminNotes: p.adminNotes || '',
    submittedAt: p.submittedAt || new Date(),
    updatedAt: p.updatedAt || new Date()
  }));

  fs.writeFileSync(backupFile, JSON.stringify(backupList, null, 2));
  console.log(`✅ Saved ${backupList.length} payment submissions to ${backupFile}`);

  // Also ensure all 7 teams in Team collection have registrationStatus = 'pending' and correct fields
  for (const p of backupList) {
    await Team.findOneAndUpdate(
      { teamId: p.teamId },
      {
        $set: {
          registrationStatus: p.status || 'pending',
          members: p.members,
          'payment.utrId': p.utrId,
          'payment.amount': p.amount,
          attemptsUsed: p.attemptsUsed,
          attemptsAllowed: p.attemptsAllowed,
          isLocked: p.isLocked,
          allowResubmit: p.allowResubmit,
          updatedAt: new Date()
        }
      }
    );
    console.log(`✔ Synced Team ${p.teamId} (${p.teamName}) in Team collection.`);
  }

  console.log('🎉 Done syncing Atlas to local backup and Team collection!');
  process.exit(0);
}

syncPaymentsFromAtlas().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});

require('dotenv').config();
const mongoose = require('mongoose');

async function compare() {
  await mongoose.connect(process.env.MONGO_URI);
  const Team = require('../models/Team');
  const Payment = require('../models/Payment');
  
  const teams = await Team.find({
    $or: [
      { registrationStatus: { $ne: 'unregistered' } },
      { 'payment.utrId': { $exists: true, $ne: '' } },
      { attemptsUsed: { $gt: 0 } }
    ]
  }).lean();
  
  const payments = await Payment.find().lean();
  
  console.log('Teams with reg/payment in Team collection:', teams.length);
  teams.forEach(t => console.log('Team:', t.teamId, t.teamName, 'status:', t.registrationStatus, 'utr:', t.payment?.utrId, 'attempts:', t.attemptsUsed, 'isLocked:', t.isLocked, 'canSubmit:', t.allowResubmit || !t.isLocked));
  
  console.log('\nPayments in Payment collection:', payments.length);
  payments.forEach(p => console.log('Payment:', p.teamId, p.teamName, 'status:', p.status, 'utr:', p.utrId, 'attempts:', p.attemptsUsed, 'isLocked:', p.isLocked));

  // Check if there are any other collections or documents
  const allTeams = await Team.find().lean();
  console.log('\nTotal teams in Team collection:', allTeams.length);
  
  process.exit(0);
}

compare().catch(err => {
  console.error(err);
  process.exit(1);
});

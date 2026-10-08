/**
 * send_new_teams_mail.js
 * 
 * Sends selection confirmation emails to the 6 newly added/replaced teams.
 * These teams replaced previous entries in the registration list.
 * 
 * Usage:  node scripts/send_new_teams_mail.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sendOne, buildHtml } = require('../lib/mailer');

// The 6 newly added teams (replaced from the CSV)
const NEW_TEAMS = [
  {
    rank: 55,
    id: 'AV_055',
    name: 'JASP',
    leadName: 'Jai kishan',
    college: "Vignan's Institute of Information Technology (VIIT)",
    theme: '',
    emails: ['srijarayudu10@gmail.com'],
  },
  {
    rank: 57,
    id: 'AV_057',
    name: 'Sparktech',
    leadName: 'K. Charan',
    college: "Vignan's Institute of Information Technology (VIIT)",
    theme: '',
    emails: ['kscharan2008@gmail.com'],
  },
  {
    rank: 81,
    id: 'AV_081',
    name: 'SPEAR HEADS',
    leadName: 'NAMBARU BHARATH NAGA SAI',
    college: "Vignan's Institute of Information Technology (VIIT)",
    theme: '',
    emails: ['nambarubharath@gmail.com'],
  },
  {
    rank: 88,
    id: 'AV_088',
    name: 'Team Lumora',
    leadName: 'J.sri vaishnavi',
    college: "Vignan's Institute of Information Technology (VIIT)",
    theme: '',
    emails: ['jsrivaishnavi07@gmail.com'],
  },
  {
    rank: 93,
    id: 'AV_093',
    name: 'Brain Byte',
    leadName: 'A.Chamdeep',
    college: "Vignan's Institute of Information Technology (VIIT)",
    theme: '',
    emails: ['arnipallichamdeep@gmail.com'],
  },
  {
    rank: 97,
    id: 'AV_097',
    name: 'Village Visionaries',
    leadName: 'KEERTHANA.PORAPU',
    college: "Vignan's Institute of Information Technology (VIIT)",
    theme: '',
    emails: ['jayakkeerthanaa05@gmail.com'],
  },
];

const SUBJECT = '🎉 SAMARTHA 2026 - Team Selection Confirmation | {{team}}';

const MESSAGE = `Dear Team {{team}},

Congratulations! 🎉 Your team has been SELECTED for the SAMARTHA 2026 24-Hour Hackathon Finale, organised by the Department of CSE, Vignan's Institute of Information Technology (Autonomous).

📅 Dates: October 10 – 11, 2026
⏰ Reporting Time: 09:00 AM on October 10 (Hackathon starts at 10:00 AM sharp)
📍 Venue: CSE Tech Labs, VIIT, Duvvada, Visakhapatnam
💰 Registration Fee: ₹1,000 per team (includes food, Wi-Fi, mentorship & lab access)

📌 IMPORTANT – NEXT STEPS:
1. Visit our website: https://samartha.onrender.com/selected-teams
2. Find your Team ID on the Selected Teams list
3. Complete the payment registration form with your squad details & UPI screenshot

⚠️ Registration must be completed before the event. Teams that do not complete payment will not be allowed to participate.

For any queries, contact:
📞 Mahamed Mastan Jani: 86882 86621
📞 Surya Sathwik: 94935 45176
📞 Savvana Lohitha: 97056 24519
📞 Seepana Jyothirmai: 81798 79778

See you at Samartha! ⚡

Regards,
Organizing Committee, SAMARTHA 2026
Department of CSE, VIIT (Autonomous)
Duvvada, Visakhapatnam`;

const DELAY_MS = 2000; // 2 seconds between emails

async function main() {
  console.log('='.repeat(60));
  console.log('SAMARTHA 2026 - Sending Mails to 6 Newly Added Teams');
  console.log('='.repeat(60));
  console.log(`Sender: ${process.env.GMAIL_USER}`);
  console.log(`Teams to email: ${NEW_TEAMS.length}`);
  console.log('');

  let sent = 0;
  let failed = 0;

  for (const team of NEW_TEAMS) {
    const recipient = team.emails[0];
    console.log(`[${sent + failed + 1}/${NEW_TEAMS.length}] Sending to ${team.id} - ${team.name} (${recipient})...`);
    
    try {
      await sendOne(team, SUBJECT, MESSAGE);
      sent++;
      console.log(`  ✅ Sent successfully!`);
    } catch (err) {
      failed++;
      console.error(`  ❌ Failed: ${err.message}`);
    }

    // Wait between emails to avoid rate limiting
    if (sent + failed < NEW_TEAMS.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`DONE! Sent: ${sent} | Failed: ${failed}`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

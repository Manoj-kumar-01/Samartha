const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, default: '' },
  phone: { type: String, trim: true, default: '' },
}, { _id: false });

const teamSchema = new mongoose.Schema({
  // --- Official Screening Data (from Google Sheet / CSV) ---
  teamId: { type: String, required: true, unique: true, uppercase: true, trim: true },
  rank: { type: Number, default: 0 },
  teamName: { type: String, required: true, trim: true },
  teamLeadName: { type: String, required: true, trim: true },
  teamLeadEmail: { type: String, required: true, lowercase: true, trim: true },
  teamLeadPhone: { type: String, trim: true, default: '' },
  college: { type: String, trim: true, default: "Vignan's Institute of Information Technology (VIIT)" },
  theme: { type: String, trim: true, default: '' },

  // --- Dynamic Registration & Squad Roster ---
  registrationStatus: {
    type: String,
    enum: ['unregistered', 'pending', 'verified', 'rejected'],
    default: 'unregistered'
  },
  members: [memberSchema], // Additional 3 teammates

  // --- Payment & Verification Details ---
  payment: {
    utrId: { type: String, trim: true, uppercase: true, default: '' },
    amount: { type: Number, default: 1000 },
    screenshotData: { type: String, default: '' },
    verifiedAt: { type: Date, default: null }
  },

  // --- Dynamic Chance & Access Control ---
  attemptsAllowed: { type: Number, default: 1 }, // Default: 1 chance
  attemptsUsed: { type: Number, default: 0 },    // Incremented per submission
  isLocked: { type: Boolean, default: false },    // Locked once attemptsUsed >= attemptsAllowed
  allowResubmit: { type: Boolean, default: false },// Set to true in Atlas to unlock for correction

  adminNotes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

teamSchema.index({ 'payment.utrId': 1 });

module.exports = mongoose.models.Team || mongoose.model('Team', teamSchema);

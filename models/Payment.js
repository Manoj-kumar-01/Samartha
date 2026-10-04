const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, default: '' },
  phone: { type: String, trim: true, default: '' },
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  teamId: { type: String, required: true, trim: true },
  teamName: { type: String, required: true, trim: true },
  teamLeadName: { type: String, required: true, trim: true },
  teamLeadEmail: { type: String, required: true, trim: true, lowercase: true },
  teamLeadPhone: { type: String, trim: true, default: '' },
  college: { type: String, trim: true, default: '' },
  theme: { type: String, trim: true, default: '' },
  members: [memberSchema],
  utrId: { type: String, required: true, trim: true, uppercase: true },
  amount: { type: Number, default: 1000 },
  screenshotPath: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending',
  },
  adminNotes: { type: String, default: '' },
  submittedAt: { type: Date, default: Date.now },
});

paymentSchema.index({ utrId: 1 });
paymentSchema.index({ teamId: 1 });

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

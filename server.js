require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware for parsing JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets (CSS, JS, images)
// This maps the current root folder for static files
app.use(express.static(path.join(__dirname))); 

// Secure MongoDB Connection using environment variable
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected securely via env'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Basic Route to render EJS
app.get('/', (req, res) => {
  // Renders the 'index.ejs' file in the views directory
  res.render('index', { title: 'Samartha Backend' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

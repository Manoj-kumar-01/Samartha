// Loads the selected-teams list from a published Google Sheet (CSV).
// Setup: Google Sheet -> File -> Share -> Publish to web -> (your sheet) -> CSV -> copy link
// and paste it into .env as SHEET_CSV_URL.
//
// Expected columns (header names are matched loosely, case-insensitive):
//   Team Name | College | Theme | Email(s)...
// Any column whose header contains "mail" is treated as a recipient email column,
// so you can have "Leader Email", "Member 2 Email", etc.

const fs = require('fs');
const path = require('path');

const CACHE_MS = 2 * 60 * 1000; // re-fetch the sheet at most every 2 minutes
const MAX_TEAMS = 100;

let cache = { at: 0, teams: [] };

// Minimal RFC-4180 CSV parser (handles quotes, commas and newlines inside quotes)
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

function normalizeCollege(raw) {
  if (!raw) return '';
  const s = raw.trim().replace(/^["']|["']$/g, '');
  const lower = s.toLowerCase();

  // Multi-college edge case
  if (lower.includes('information technology') && lower.includes('engineering for women')) {
    return "Vignan's Institute of Information Technology (VIIT)";
  }

  // Vignan Women
  if (lower.includes('women') && (lower.includes('vignan') || lower.includes('view'))) {
    return "Vignan's Institute of Engineering for Women (VIEW)";
  }

  // VIIT
  if (lower.includes('viit') || lower.includes('vignan') || lower.includes('vignana')) {
    return "Vignan's Institute of Information Technology (VIIT)";
  }

  // GVP variants
  if (lower.includes('gayatri') || lower.includes('gvp')) {
    if (lower.includes('women')) return 'Gayatri Vidya Parishad College of Engineering for Women';
    if (lower.includes('degree') || lower.includes('pg')) return 'Gayatri Vidya Parishad College for Degree and PG Courses';
    return 'Gayatri Vidya Parishad College of Engineering (Autonomous)';
  }

  // Raghu
  if (lower.includes('raghu')) return 'Raghu Engineering College';

  // NSRIT
  if (lower.includes('nsrit') || lower.includes('satyanarayana raju')) return 'Nadimpalli Satyanarayana Raju Institute of Technology (NSRIT)';

  // Lendi
  if (lower.includes('lendi')) return 'Lendi Institute of Engineering and Technology';

  // GITAM
  if (lower.includes('gitam')) return 'GITAM Deemed to be University';

  // MVGR
  if (lower.includes('maharaj') || lower.includes('mvgr') || lower.includes('gajapathi')) return 'MVGR College of Engineering (Autonomous)';

  // Bapatla
  if (lower.includes('bapatla')) return 'Bapatla Engineering College';

  // ANITS
  if (lower.includes('anil') || lower.includes('anits') || lower.includes('neerukonda')) return 'Anil Neerukonda Institute of Technology & Sciences (ANITS)';

  // Andhra University
  if (lower.includes('andhra') || lower.includes('auce')) {
    if (lower.includes('women')) return 'Andhra University College of Engineering for Women';
    return 'Andhra University College of Engineering (AUCE)';
  }

  return s;
}

function findCol(headers, ...keywords) {
  let idx = headers.findIndex(h => keywords.includes(h));
  if (idx !== -1) return idx;
  return headers.findIndex(h => keywords.some(k => h.includes(k)));
}

function rowsToTeams(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());

  const idIdx = findCol(headers, 'team id', 'id');
  const nameIdx = findCol(headers, 'team name', 'team');
  const collegeIdx = findCol(headers, 'college name', 'college', 'institution', 'university');
  const themeIdx = findCol(headers, 'theme', 'domain', 'track');
  const emailIdxs = headers
    .map((h, i) => (h.includes('mail') ? i : -1))
    .filter(i => i !== -1);

  const emailRegex = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/g;

  return rows.slice(1)
    .map(r => {
      const emails = new Set();
      emailIdxs.forEach(i => (r[i] || '').match(emailRegex)?.forEach(e => emails.add(e.toLowerCase())));
      return {
        id: (idIdx !== -1 && r[idIdx]) ? r[idIdx].trim() : '',
        name: (r[nameIdx] || '').trim(),
        college: (collegeIdx !== -1 && r[collegeIdx]) ? normalizeCollege(r[collegeIdx]) : '',
        theme: (themeIdx !== -1 && r[themeIdx]) ? (r[themeIdx] || '').trim() : '',
        emails: [...emails],
      };
    })
    .filter(t => t.name)
    .slice(0, MAX_TEAMS)
    .map((t, i) => ({ rank: i + 1, ...t }));
}

async function getTeams({ force = false } = {}) {
  if (!force && Date.now() - cache.at < CACHE_MS && cache.teams.length) return cache.teams;

  let csv;
  if (process.env.SHEET_CSV_URL) {
    const res = await fetch(process.env.SHEET_CSV_URL, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Google Sheet fetch failed (${res.status})`);
    csv = await res.text();
  } else {
    // Check root CSV or fallback to data/teams.csv
    const rootCsvPath = path.join(__dirname, '..', 'Samartha_Hackathon_2026_Final_Ranked_Registration_List - Final Results (2).csv');
    const dataCsvPath = path.join(__dirname, '..', 'data', 'teams.csv');
    if (fs.existsSync(rootCsvPath)) {
      csv = fs.readFileSync(rootCsvPath, 'utf8');
    } else if (fs.existsSync(dataCsvPath)) {
      csv = fs.readFileSync(dataCsvPath, 'utf8');
    } else {
      return [];
    }
  }

  cache = { at: Date.now(), teams: rowsToTeams(parseCsv(csv)) };
  return cache.teams;
}

// Public-safe version: never expose emails on the public page
async function getPublicTeams() {
  const teams = await getTeams();
  return teams.map(({ rank, id, name, college, theme }) => ({ rank, id, name, college, theme }));
}

module.exports = { getTeams, getPublicTeams };

const express = require('express');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '779830';
const OUTPUT_FILE = path.join(__dirname, 'football-epg.xml');

// --- ALL LEAGUES ---
const LEAGUES = [
  { id: '4335', name: 'La Liga',        prefix: 'laliga',    lang: 'es' },
  { id: '4334', name: 'Ligue 1',        prefix: 'ligue1',    lang: 'fr' },
  { id: '4332', name: 'Serie A',        prefix: 'seriea',    lang: 'it' },
  { id: '4331', name: 'Bundesliga',     prefix: 'bundesliga',lang: 'de' },
  { id: '4346', name: 'MLS',            prefix: 'mls',       lang: 'en' },
  { id: '4344', name: 'Primeira Liga',  prefix: 'primeiraliga', lang: 'pt' },
  { id: '4328', name: 'Premier League', prefix: 'epl',       lang: 'en' },
  { id: '4668', name: 'Saudi Pro League', prefix: 'spl',     lang: 'ar' },
];

// --- 1. FETCH FIXTURES FOR A SINGLE LEAGUE ---
async function fetchFixtures(leagueId) {
  const url = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsnextleague.php?id=${leagueId}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.events || [];
}

// --- 2. CONVERT A DATE + TIME TO XMLTV FORMAT ---
function toXMLTVDate(dateStr, timeStr) {
  const dt = new Date(`${dateStr}T${timeStr}Z`);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${dt.getUTCFullYear()}` +
    `${pad(dt.getUTCMonth() + 1)}` +
    `${pad(dt.getUTCDate())}` +
    `${pad(dt.getUTCHours())}` +
    `${pad(dt.getUTCMinutes())}` +
    `${pad(dt.getUTCSeconds())}` +
    ` +0000`
  );
}

// --- 3. SHIFT MINUTES ON AN XMLTV TIMESTAMP ---
function shiftMinutes(xmltvDate, mins) {
  const base = xmltvDate.replace(' +0000', '');
  const y  = base.slice(0, 4),  mo = base.slice(4, 6),  d  = base.slice(6, 8);
  const h  = base.slice(8, 10), mi = base.slice(10, 12), s  = base.slice(12, 14);
  const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  dt.setMinutes(dt.getMinutes() + mins);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${dt.getUTCFullYear()}` +
    `${pad(dt.getUTCMonth() + 1)}` +
    `${pad(dt.getUTCDate())}` +
    `${pad(dt.getUTCHours())}` +
    `${pad(dt.getUTCMinutes())}` +
    `${pad(dt.getUTCSeconds())}` +
    ` +0000`
  );
}

// --- 4. SANITIZE TEXT FOR XML ---
function escapeXML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- 5. BUILD THE COMBINED XML FILE ---
async function generateEPG() {
  console.log(`[${new Date().toISOString()}] Starting EPG generation for all leagues...`);

  let allChannels = '';
  let allProgrammes = '';
  let totalMatches = 0;

  for (const league of LEAGUES) {
    console.log(`  Fetching ${league.name}...`);
    const events = await fetchFixtures(league.id);

    if (events.length === 0) {
      console.log(`  No fixtures found for ${league.name}, skipping.`);
      continue;
    }

    for (const event of events) {
      const channelId  = `${league.prefix}-match-${event.idEvent}`;
      const matchTitle = escapeXML(`${event.strHomeTeam} vs ${event.strAwayTeam}`);

      // Channel block
      allChannels += `  <channel id="${channelId}">\n`;
      allChannels += `    <display-name lang="${league.lang}">${matchTitle}</display-name>\n`;
      allChannels += `    <display-name lang="en">${league.name}: ${matchTitle}</display-name>\n`;
      allChannels += `  </channel>\n`;

      if (!event.dateEvent || !event.strTime) {
        console.log(`  Skipping ${event.strEvent} - missing date/time`);
        continue;
      }

      const matchStart = toXMLTVDate(event.dateEvent, event.strTime);
      const matchEnd   = shiftMinutes(matchStart, 120);
      const preStart   = shiftMinutes(matchStart, -720);
      const postEnd    = shiftMinutes(matchEnd, 720);
      const thumb      = event.strThumb || '';

      // Block 1: Next Match
      allProgrammes += `  <programme start="${preStart}" stop="${matchStart}" channel="${channelId}">\n`;
      allProgrammes += `    <title lang="${league.lang}">Next Match: ${matchTitle}</title>\n`;
      allProgrammes += `    <desc lang="${league.lang}">Up next: ${league.name} - ${matchTitle} | ${event.dateEvent}</desc>\n`;
      allProgrammes += `    <category lang="en">Football</category>\n`;
      if (thumb) allProgrammes += `    <icon src="${thumb}" />\n`;
      allProgrammes += `  </programme>\n\n`;

      // Block 2: The Match
      allProgrammes += `  <programme start="${matchStart}" stop="${matchEnd}" channel="${channelId}">\n`;
      allProgrammes += `    <title lang="${league.lang}">${matchTitle}</title>\n`;
      allProgrammes += `    <desc lang="${league.lang}">${league.name} - ${matchTitle} | ${event.dateEvent}</desc>\n`;
      allProgrammes += `    <category lang="en">Football</category>\n`;
      if (thumb) allProgrammes += `    <icon src="${thumb}" />\n`;
      allProgrammes += `  </programme>\n\n`;

      // Block 3: Match Ended
      allProgrammes += `  <programme start="${matchEnd}" stop="${postEnd}" channel="${channelId}">\n`;
      allProgrammes += `    <title lang="${league.lang}">Match Ended: ${matchTitle}</title>\n`;
      allProgrammes += `    <desc lang="${league.lang}">The match has ended. ${league.name} - ${matchTitle} | ${event.dateEvent}</desc>\n`;
      allProgrammes += `    <category lang="en">Football</category>\n`;
      if (thumb) allProgrammes += `    <icon src="${thumb}" />\n`;
      allProgrammes += `  </programme>\n\n`;

      totalMatches++;
    }
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE tv SYSTEM "xmltv.dtd">\n` +
    `<tv generator-info-name="FootballEPG">\n\n` +
    allChannels + `\n` +
    allProgrammes +
    `</tv>`;

  fs.writeFileSync(OUTPUT_FILE, xml, 'utf8');
  console.log(`[${new Date().toISOString()}] EPG generated — ${totalMatches} matches across ${LEAGUES.length} leagues.`);
}

// --- 6. SERVE THE XML FILE ---
app.get('/epg.xml', (req, res) => {
  if (fs.existsSync(OUTPUT_FILE)) {
    res.setHeader('Content-Type', 'application/xml');
    res.sendFile(OUTPUT_FILE);
  } else {
    res.status(503).send('EPG not yet generated. Please try again in a moment.');
  }
});

app.get('/', (req, res) => {
  res.send('Football EPG server is running. Access your EPG at /epg.xml');
});

// --- 7. SCHEDULE DAILY AUTO-REFRESH ---
cron.schedule('0 3 * * *', () => {
  console.log('Running scheduled EPG refresh...');
  generateEPG();
});

// --- 8. START SERVER + GENERATE ON BOOT ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  generateEPG();
});
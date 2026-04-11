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
  // Domestic Leagues
  { id: '4335', name: 'La Liga',          prefix: 'laliga',       lang: 'es' },
  { id: '4334', name: 'Ligue 1',          prefix: 'ligue1',       lang: 'fr' },
  { id: '4332', name: 'Serie A',          prefix: 'seriea',       lang: 'it' },
  { id: '4331', name: 'Bundesliga',       prefix: 'bundesliga',   lang: 'de' },
  { id: '4346', name: 'MLS',              prefix: 'mls',          lang: 'en' },
  { id: '4344', name: 'Primeira Liga',    prefix: 'primeiraliga', lang: 'pt' },
  { id: '4328', name: 'Premier League',   prefix: 'epl',          lang: 'en' },
  { id: '4668', name: 'Saudi Pro League', prefix: 'spl',          lang: 'ar' },
  { id: '4849', name: 'Women\'s Super League', prefix: 'wsl',     lang: 'en' },
  { id: '4350', name: 'Liga MX',             prefix: 'ligamx',   lang: 'es' },
  // Motorsport
  { id: '4370', name: 'Formula 1',        prefix: 'f1',           lang: 'en' },
  // North American Pro Leagues (custom Next Game / Live / Event Over format)
  { id: '4380', name: 'NHL',              prefix: 'nhl',          lang: 'en', duration: 120 },
  { id: '4424', name: 'MLB',              prefix: 'mlb',          lang: 'en', duration: 180 },
  { id: '4387', name: 'NBA',              prefix: 'nba',          lang: 'en', duration: 150 },
  { id: '4391', name: 'NFL',              prefix: 'nfl',          lang: 'en', duration: 210 },
  // Combat Sports & Wrestling
  { id: '4445', name: 'Boxing',           prefix: 'boxing',       lang: 'en', duration: 300 },
  { id: '4443', name: 'UFC',              prefix: 'ufc',          lang: 'en', duration: 180, fixedStartHourEST: 21 },
  { id: '4444', name: 'WWE',              prefix: 'wwe',          lang: 'en', duration: 180 },
  { id: '4563', name: 'AEW',              prefix: 'aew',          lang: 'en', duration: 180 },
  // UEFA Club Competitions
  { id: '4480', name: 'UEFA Champions League',  prefix: 'ucl',  lang: 'en' },
  { id: '4481', name: 'UEFA Europa League',     prefix: 'uel',  lang: 'en' },
  { id: '5071', name: 'UEFA Conference League', prefix: 'uecl', lang: 'en' },
  { id: '4721', name: 'CONCACAF Champions Cup',  prefix: 'concacafcc', lang: 'en' },
  { id: '4501', name: 'Copa Libertadores',        prefix: 'libertadores', lang: 'es' },
  // Women's Football
  { id: '4889', name: 'UEFA Women\'s Champions League', prefix: 'uwcl',  lang: 'en' },
  { id: '4865', name: 'UEFA Women\'s Euro',             prefix: 'weuro', lang: 'en' },
  // International Tournaments
  { id: '4429', name: 'FIFA World Cup',           prefix: 'worldcup',     lang: 'en' },
  { id: '4502', name: 'UEFA Euro Championship',   prefix: 'euro',         lang: 'en' },
  { id: '4499', name: 'Copa America',             prefix: 'copaam',       lang: 'es' },
  { id: '4496', name: 'AFCON',                    prefix: 'afcon',        lang: 'en' },
  { id: '4490', name: 'UEFA Nations League',      prefix: 'uefanl',       lang: 'en' },
  { id: '5280', name: 'CONCACAF Nations League',  prefix: 'concacafnl',   lang: 'en' },
  { id: '4562', name: 'International Friendlies', prefix: 'intlfriendly', lang: 'en' },
  { id: '4503', name: 'FIFA Club World Cup',      prefix: 'clubwc',       lang: 'en' },
  // World Cup Qualifying
  { id: '5518', name: 'WC Qualifying UEFA',                prefix: 'wcq-uefa2',     lang: 'en' },
  { id: '6943', name: 'WC Qualifying UEFA (Playoffs)',     prefix: 'wcq-uefa',      lang: 'en' },
  { id: '5582', name: 'WC Qualifying CONMEBOL',            prefix: 'wcq-conmebol',  lang: 'es' },
  { id: '5973', name: 'WC Qualifying CONCACAF',            prefix: 'wcq-concacaf',  lang: 'en' },
  { id: '5583', name: 'WC Qualifying AFC',                 prefix: 'wcq-afc',       lang: 'en' },
  { id: '5733', name: 'WC Qualifying CAF',                 prefix: 'wcq-caf',       lang: 'en' },
  { id: '5517', name: 'WC Qualifying OFC',                 prefix: 'wcq-ofc',       lang: 'en' },
  { id: '5850', name: 'WC Qualifying Inter-Confederation', prefix: 'wcq-intercof',  lang: 'en' },
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

// --- 3b. FORMAT A Date AS XMLTV ---
function dateToXMLTV(dt) {
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

// --- 3c. RESOLVE A FIXED "HOUR IN EST" ANCHORED TO THE EVENT'S US CALENDAR DATE ---
// EST is UTC-5 year-round (no DST), so 9 PM EST = 02:00 UTC the following day.
// The US calendar date is derived from the API's UTC timestamp shifted into EST,
// which handles events where TheSportsDB lists the next UTC day (e.g. 00:00 UTC).
function fixedESTStart(dateEvent, strTime, hourEST) {
  const [y, m, d] = dateEvent.split('-').map(Number);
  const [h, mi, s] = (strTime || '00:00:00').split(':').map(Number);
  const apiUTC = Date.UTC(y, m - 1, d, h, mi, s);
  const estMs  = apiUTC - 5 * 3600 * 1000;
  const est    = new Date(estMs);
  return new Date(Date.UTC(
    est.getUTCFullYear(),
    est.getUTCMonth(),
    est.getUTCDate(),
    hourEST + 5, 0, 0
  ));
}

// --- 3d. PRO LEAGUE SHORT NAMES + DATE FORMATTING ---
const NHL_SHORT_NAMES = {
  'Anaheim Ducks': 'Ducks',
  'Boston Bruins': 'Bruins',
  'Buffalo Sabres': 'Sabres',
  'Calgary Flames': 'Flames',
  'Carolina Hurricanes': 'Hurricanes',
  'Chicago Blackhawks': 'Blackhawks',
  'Colorado Avalanche': 'Avalanche',
  'Columbus Blue Jackets': 'Blue Jackets',
  'Dallas Stars': 'Stars',
  'Detroit Red Wings': 'Red Wings',
  'Edmonton Oilers': 'Oilers',
  'Florida Panthers': 'Panthers',
  'Los Angeles Kings': 'Kings',
  'Minnesota Wild': 'Wild',
  'Montreal Canadiens': 'Canadiens',
  'Nashville Predators': 'Predators',
  'New Jersey Devils': 'Devils',
  'New York Islanders': 'Islanders',
  'New York Rangers': 'Rangers',
  'Ottawa Senators': 'Senators',
  'Philadelphia Flyers': 'Flyers',
  'Pittsburgh Penguins': 'Penguins',
  'San Jose Sharks': 'Sharks',
  'Seattle Kraken': 'Kraken',
  'St. Louis Blues': 'Blues',
  'Tampa Bay Lightning': 'Lightning',
  'Toronto Maple Leafs': 'Maple Leafs',
  'Utah Hockey Club': 'Utah',
  'Utah Mammoth': 'Mammoth',
  'Vancouver Canucks': 'Canucks',
  'Vegas Golden Knights': 'Golden Knights',
  'Washington Capitals': 'Capitals',
  'Winnipeg Jets': 'Jets',
};

const MLB_SHORT_NAMES = {
  'Arizona Diamondbacks': 'Diamondbacks',
  'Athletics': 'Athletics',
  'Atlanta Braves': 'Braves',
  'Baltimore Orioles': 'Orioles',
  'Boston Red Sox': 'Red Sox',
  'Chicago Cubs': 'Cubs',
  'Chicago White Sox': 'White Sox',
  'Cincinnati Reds': 'Reds',
  'Cleveland Guardians': 'Guardians',
  'Colorado Rockies': 'Rockies',
  'Detroit Tigers': 'Tigers',
  'Houston Astros': 'Astros',
  'Kansas City Royals': 'Royals',
  'Los Angeles Angels': 'Angels',
  'Los Angeles Dodgers': 'Dodgers',
  'Miami Marlins': 'Marlins',
  'Milwaukee Brewers': 'Brewers',
  'Minnesota Twins': 'Twins',
  'New York Mets': 'Mets',
  'New York Yankees': 'Yankees',
  'Oakland Athletics': 'Athletics',
  'Philadelphia Phillies': 'Phillies',
  'Pittsburgh Pirates': 'Pirates',
  'Sacramento Athletics': 'Athletics',
  'San Diego Padres': 'Padres',
  'San Francisco Giants': 'Giants',
  'Seattle Mariners': 'Mariners',
  'St. Louis Cardinals': 'Cardinals',
  'Tampa Bay Rays': 'Rays',
  'Texas Rangers': 'Rangers',
  'Toronto Blue Jays': 'Blue Jays',
  'Washington Nationals': 'Nationals',
};

const NBA_SHORT_NAMES = {
  'Atlanta Hawks': 'Hawks',
  'Boston Celtics': 'Celtics',
  'Brooklyn Nets': 'Nets',
  'Charlotte Hornets': 'Hornets',
  'Chicago Bulls': 'Bulls',
  'Cleveland Cavaliers': 'Cavaliers',
  'Dallas Mavericks': 'Mavericks',
  'Denver Nuggets': 'Nuggets',
  'Detroit Pistons': 'Pistons',
  'Golden State Warriors': 'Warriors',
  'Houston Rockets': 'Rockets',
  'Indiana Pacers': 'Pacers',
  'LA Clippers': 'Clippers',
  'Los Angeles Clippers': 'Clippers',
  'Los Angeles Lakers': 'Lakers',
  'Memphis Grizzlies': 'Grizzlies',
  'Miami Heat': 'Heat',
  'Milwaukee Bucks': 'Bucks',
  'Minnesota Timberwolves': 'Timberwolves',
  'New Orleans Pelicans': 'Pelicans',
  'New York Knicks': 'Knicks',
  'Oklahoma City Thunder': 'Thunder',
  'Orlando Magic': 'Magic',
  'Philadelphia 76ers': '76ers',
  'Phoenix Suns': 'Suns',
  'Portland Trail Blazers': 'Trail Blazers',
  'Sacramento Kings': 'Kings',
  'San Antonio Spurs': 'Spurs',
  'Toronto Raptors': 'Raptors',
  'Utah Jazz': 'Jazz',
  'Washington Wizards': 'Wizards',
};

const NFL_SHORT_NAMES = {
  'Arizona Cardinals': 'Cardinals',
  'Atlanta Falcons': 'Falcons',
  'Baltimore Ravens': 'Ravens',
  'Buffalo Bills': 'Bills',
  'Carolina Panthers': 'Panthers',
  'Chicago Bears': 'Bears',
  'Cincinnati Bengals': 'Bengals',
  'Cleveland Browns': 'Browns',
  'Dallas Cowboys': 'Cowboys',
  'Denver Broncos': 'Broncos',
  'Detroit Lions': 'Lions',
  'Green Bay Packers': 'Packers',
  'Houston Texans': 'Texans',
  'Indianapolis Colts': 'Colts',
  'Jacksonville Jaguars': 'Jaguars',
  'Kansas City Chiefs': 'Chiefs',
  'Las Vegas Raiders': 'Raiders',
  'Los Angeles Chargers': 'Chargers',
  'Los Angeles Rams': 'Rams',
  'Miami Dolphins': 'Dolphins',
  'Minnesota Vikings': 'Vikings',
  'New England Patriots': 'Patriots',
  'New Orleans Saints': 'Saints',
  'New York Giants': 'Giants',
  'New York Jets': 'Jets',
  'Philadelphia Eagles': 'Eagles',
  'Pittsburgh Steelers': 'Steelers',
  'San Francisco 49ers': '49ers',
  'Seattle Seahawks': 'Seahawks',
  'Tampa Bay Buccaneers': 'Buccaneers',
  'Tennessee Titans': 'Titans',
  'Washington Commanders': 'Commanders',
};

// League-ID → { display label for the live block, team short-name map }
const PRO_LEAGUE_FORMATS = {
  '4380': { sportLabel: 'NHL Hockey',     shortNames: NHL_SHORT_NAMES },
  '4424': { sportLabel: 'MLB Baseball',   shortNames: MLB_SHORT_NAMES },
  '4387': { sportLabel: 'NBA Basketball', shortNames: NBA_SHORT_NAMES },
  '4391': { sportLabel: 'NFL Football',   shortNames: NFL_SHORT_NAMES },
};

function proShort(map, fullName) {
  if (!fullName) return '';
  return map[fullName] || fullName.split(' ').slice(-1)[0];
}

function formatEventDateLabelEST(dateEvent, strTime) {
  const [y, m, d]  = dateEvent.split('-').map(Number);
  const [h, mi]    = (strTime || '00:00:00').split(':').map(Number);
  const est = new Date(Date.UTC(y, m - 1, d, h, mi) - 5 * 3600 * 1000);
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  let hr12 = est.getUTCHours() % 12;
  if (hr12 === 0) hr12 = 12;
  const ampm = est.getUTCHours() >= 12 ? 'PM' : 'AM';
  const mins = String(est.getUTCMinutes()).padStart(2, '0');
  return `${months[est.getUTCMonth()]} ${est.getUTCDate()}, ${est.getUTCFullYear()} at ${hr12}:${mins}${ampm} EST`;
}

// --- 4. SANITIZE TEXT FOR XML ---
function escapeXML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- 4b. EASTERN-TIME CALENDAR DATE HELPERS ---
// DST-aware: converts via Intl rather than a fixed UTC offset so the
// "today" window matches America/New_York regardless of EST/EDT.
const NY_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
});
function nyDateStringOfEvent(dateEvent, strTime) {
  if (!dateEvent) return null;
  const [y, m, d]  = dateEvent.split('-').map(Number);
  const [h, mi, s] = (strTime || '00:00:00').split(':').map(Number);
  return NY_DATE_FMT.format(new Date(Date.UTC(y, m - 1, d, h, mi, s || 0)));
}
function nyDateStringNow() {
  return NY_DATE_FMT.format(new Date());
}

// --- 5. BUILD THE COMBINED XML FILE ---
async function generateEPG(todayOnly = false) {
  const today = todayOnly ? nyDateStringNow() : null;
  console.log(`[${new Date().toISOString()}] Starting EPG generation for all leagues${todayOnly ? ` (today only: ${today})` : ''}...`);

  let allChannels   = '';
  let allProgrammes = '';
  let totalMatches  = 0;

  for (const league of LEAGUES) {
    console.log(`  Fetching ${league.name}...`);

    const events = await fetchFixtures(league.id);

    if (events.length === 0) {
      console.log(`  No fixtures found for ${league.name}, skipping.`);
      continue;
    }

    for (const event of events) {
      const hasTeams = event.strHomeTeam && event.strAwayTeam;
      if (!hasTeams && !event.strEvent) continue;

      if (todayOnly && nyDateStringOfEvent(event.dateEvent, event.strTime) !== today) continue;

      const channelId  = `${league.prefix}-match-${event.idEvent}`;
      const rawTitle   = hasTeams ? `${event.strHomeTeam} vs ${event.strAwayTeam}` : event.strEvent;
      const matchTitle = escapeXML(rawTitle);

      // Channel block
      allChannels += `  <channel id="${channelId}">\n`;
      allChannels += `    <display-name lang="${league.lang}">${matchTitle}</display-name>\n`;
      allChannels += `    <display-name lang="en">${league.name}: ${matchTitle}</display-name>\n`;
      allChannels += `  </channel>\n`;

      if (!event.dateEvent || !event.strTime) {
        console.log(`  Skipping ${event.strEvent} - missing date/time`);
        continue;
      }

      const matchStart = league.fixedStartHourEST != null
        ? dateToXMLTV(fixedESTStart(event.dateEvent, event.strTime, league.fixedStartHourEST))
        : toXMLTVDate(event.dateEvent, event.strTime);
      const matchEnd   = shiftMinutes(matchStart, league.duration || 120);
      const preStart   = shiftMinutes(matchStart, -720);
      const postEnd    = shiftMinutes(matchEnd, 720);
      const thumb      = event.strThumb || '';

      // Pro-league (NHL / MLB / NBA / NFL) custom title+description format
      const proFormat = PRO_LEAGUE_FORMATS[league.id];
      if (proFormat && hasTeams) {
        const homeShort  = proShort(proFormat.shortNames, event.strHomeTeam);
        const awayShort  = proShort(proFormat.shortNames, event.strAwayTeam);
        const fullMatch  = escapeXML(`${event.strHomeTeam} vs. ${event.strAwayTeam}`);
        const shortMatch = escapeXML(`${homeShort} vs. ${awayShort}`);
        const dateStr    = formatEventDateLabelEST(event.dateEvent, event.strTime);
        const liveDesc   = event.strDescriptionEN
          ? escapeXML(event.strDescriptionEN)
          : `${proFormat.sportLabel}: ${fullMatch}`;

        // Block 1: Next Game
        allProgrammes += `  <programme start="${preStart}" stop="${matchStart}" channel="${channelId}">\n`;
        allProgrammes += `    <title lang="en">Next Game: ${fullMatch}</title>\n`;
        allProgrammes += `    <desc lang="en">Next Game: ${shortMatch} on ${dateStr}</desc>\n`;
        allProgrammes += `    <category lang="en">${league.name}</category>\n`;
        if (thumb) allProgrammes += `    <icon src="${thumb}" />\n`;
        allProgrammes += `  </programme>\n\n`;

        // Block 2: Live Game
        allProgrammes += `  <programme start="${matchStart}" stop="${matchEnd}" channel="${channelId}">\n`;
        allProgrammes += `    <title lang="en">${proFormat.sportLabel}: ${fullMatch}</title>\n`;
        allProgrammes += `    <desc lang="en">${liveDesc}</desc>\n`;
        allProgrammes += `    <category lang="en">${league.name}</category>\n`;
        if (thumb) allProgrammes += `    <icon src="${thumb}" />\n`;
        allProgrammes += `  </programme>\n\n`;

        // Block 3: Event Over
        allProgrammes += `  <programme start="${matchEnd}" stop="${postEnd}" channel="${channelId}">\n`;
        allProgrammes += `    <title lang="en">Event Over</title>\n`;
        allProgrammes += `    <desc lang="en">${fullMatch} — game ended.</desc>\n`;
        allProgrammes += `    <category lang="en">${league.name}</category>\n`;
        if (thumb) allProgrammes += `    <icon src="${thumb}" />\n`;
        allProgrammes += `  </programme>\n\n`;

        totalMatches++;
        continue;
      }

      // Block 1: Next Match
      allProgrammes += `  <programme start="${preStart}" stop="${matchStart}" channel="${channelId}">\n`;
      allProgrammes += `    <title lang="${league.lang}">Next Match: ${matchTitle}</title>\n`;
      allProgrammes += `    <desc lang="${league.lang}">Up next: ${league.name} - ${matchTitle} | ${event.dateEvent}</desc>\n`;
      allProgrammes += `    <category lang="en">${league.name}</category>\n`;
      if (thumb) allProgrammes += `    <icon src="${thumb}" />\n`;
      allProgrammes += `  </programme>\n\n`;

      // Block 2: The Match
      allProgrammes += `  <programme start="${matchStart}" stop="${matchEnd}" channel="${channelId}">\n`;
      allProgrammes += `    <title lang="${league.lang}">${matchTitle}</title>\n`;
      allProgrammes += `    <desc lang="${league.lang}">${league.name} - ${matchTitle} | ${event.dateEvent}</desc>\n`;
      allProgrammes += `    <category lang="en">${league.name}</category>\n`;
      if (thumb) allProgrammes += `    <icon src="${thumb}" />\n`;
      allProgrammes += `  </programme>\n\n`;

      // Block 3: Match Ended
      allProgrammes += `  <programme start="${matchEnd}" stop="${postEnd}" channel="${channelId}">\n`;
      allProgrammes += `    <title lang="${league.lang}">Match Ended: ${matchTitle}</title>\n`;
      allProgrammes += `    <desc lang="${league.lang}">The match has ended. ${league.name} - ${matchTitle} | ${event.dateEvent}</desc>\n`;
      allProgrammes += `    <category lang="en">${league.name}</category>\n`;
      if (thumb) allProgrammes += `    <icon src="${thumb}" />\n`;
      allProgrammes += `  </programme>\n\n`;

      totalMatches++;
    }
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE tv SYSTEM "xmltv.dtd">\n` +
    `<tv generator-info-name="SportsEPG">\n\n` +
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
  res.send('Sports EPG server is running. Access your EPG at /epg.xml');
});

// --- 7. SCHEDULE DAILY AUTO-REFRESH ---
// Runs at 3 AM Eastern (DST-aware) and filters the XML to today's events only.
// Boot-time generation deliberately does NOT filter, so a restart never
// strips upcoming fixtures from the served feed between cron runs.
cron.schedule('0 3 * * *', () => {
  console.log('Running scheduled EPG refresh...');
  generateEPG(true);
}, { timezone: 'America/New_York' });

// --- 8. START SERVER + GENERATE ON BOOT ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  generateEPG(false);
});
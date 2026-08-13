const fs = require('fs');
const path = require('path');
const distDir = path.join(__dirname, '..', '..', 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

const token = process.env.GITHUB_TOKEN;
const username = process.env.GITHUB_USER || process.argv[2] || 'Shyaam-04';
if (!token) {
  console.error('GITHUB_TOKEN is required');
  process.exit(1);
}

async function fetchJSON(url) {
  const res = await fetch(url, { 
    headers: { 
      Authorization: `Bearer ${token}`, 
      'User-Agent': 'github-badges-generator',
      'Accept': 'application/vnd.github+json'
    } 
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function graphql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${token}`, 
      'Content-Type': 'application/json',
      'User-Agent': 'github-badges-generator'
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

function writeSVG(name, content) {
  fs.writeFileSync(path.join(distDir, name), content, 'utf8');
  console.log('Wrote', name);
}

function makeStatsSVG(followers, stars, repos) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="640" height="150" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0D1117" rx="12" stroke="#30363d" stroke-width="1"/>
  <style>
    .title { fill: #A970FF; font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-weight: 600; }
    .num { fill: #C9D1D9; font-size: 26px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-weight: bold; text-anchor: middle; }
    .label { fill: #8b949e; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; text-anchor: middle; }
  </style>
  <text x="32" y="35" class="title">📊 GitHub Stats</text>
  <g transform="translate(160, 75)">
    <text x="0" y="0" class="num" dominant-baseline="middle">${followers}</text>
    <text x="0" y="24" class="label" dominant-baseline="middle">Followers</text>
  </g>
  <g transform="translate(320, 75)">
    <text x="0" y="0" class="num" dominant-baseline="middle">${stars}</text>
    <text x="0" y="24" class="label" dominant-baseline="middle">Total Stars</text>
  </g>
  <g transform="translate(480, 75)">
    <text x="0" y="0" class="num" dominant-baseline="middle">${repos}</text>
    <text x="0" y="24" class="label" dominant-baseline="middle">Public Repos</text>
  </g>
</svg>`;
}

function makeTopLangsSVG(langs) {
  const width = 640; 
  const height = 180; 
  const barX = 150; 
  const barW = 400; 
  const barH = 10;
  let rows = '';
  
  langs.slice(0, 5).forEach((l, i) => {
    const y = 45 + i * 26;
    const pct = (Math.round(l.pct * 10) / 10); // one decimal precision
    const pctLabel = pct < 1 && pct > 0 ? pct.toFixed(1) : Math.round(pct);
    const w = Math.max(4, Math.round((pct / 100) * barW));
    rows += `
    <text x="24" y="${y + 9}" fill="#C9D1D9" font-size="12" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${l.lang}</text>
    <rect x="${barX}" y="${y}" width="${barW}" height="${barH}" fill="#21262d" rx="5" />
    <rect x="${barX}" y="${y}" width="${w}" height="${barH}" fill="#A970FF" rx="5" />
    <text x="${barX + barW + 12}" y="${y + 9}" fill="#8b949e" font-size="12" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${pctLabel}%</text>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0D1117" rx="12" stroke="#30363d" stroke-width="1"/>
  <text x="24" y="28" fill="#A970FF" font-size="15" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="600">⚡ Top Languages</text>
  ${rows}
</svg>`;
}

function makeStreakSVG(streak) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="640" height="150" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0D1117" rx="12" stroke="#30363d" stroke-width="1"/>
  <style>
    .title { fill: #A970FF; font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-weight: 600; }
    .num { fill: #C9D1D9; font-size: 32px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-weight: bold; text-anchor: middle; }
    .label { fill: #8b949e; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; text-anchor: middle; }
  </style>
  <text x="32" y="35" class="title">🔥 Current Streak</text>
  <g transform="translate(320, 85)">
    <text x="0" y="0" class="num" dominant-baseline="middle">${streak} Days</text>
    <text x="0" y="24" class="label" dominant-baseline="middle">Consecutive Contribution Days</text>
  </g>
</svg>`;
}

async function main(){
  try{
    const user = await fetchJSON(`https://api.github.com/users/${username}`);
    const followers = user.followers || 0;
    const public_repos = user.public_repos || 0;

    const repos = await fetchJSON(`https://api.github.com/users/${username}/repos?per_page=100&type=owner`);
    let totalStars = 0;
    const langSizes = {};
    
    for(const r of repos){
      totalStars += r.stargazers_count || 0;
      try{
        const langs = await fetchJSON(`https://api.github.com/repos/${username}/${r.name}/languages`);
        for(const [k,v] of Object.entries(langs)) {
          // treat Jupyter Notebook bytes as Python so experiments don't skew results
          const key = (k === 'Jupyter Notebook') ? 'Python' : k;
          langSizes[key] = (langSizes[key] || 0) + v;
        }
      }catch(e){/* ignore repo language errors */}
    }

    const totalBytes = Object.values(langSizes).reduce((a, b) => a + b, 0) || 1;
    const langs = Object.entries(langSizes)
      .map(([lang, bytes]) => ({ lang, bytes, pct: (bytes / totalBytes) * 100 }))
      .sort((a, b) => b.bytes - a.bytes);

    const from = new Date(); 
    from.setDate(from.getDate() - 365);
    const query = `query($login:String!, $from:DateTime!) { user(login:$login) { contributionsCollection(from:$from) { contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }`;
    const res = await graphql(query, { login: username, from: from.toISOString() });
    const weeks = res.user.contributionsCollection.contributionCalendar.weeks;
    const days = [];
    for(const w of weeks){
      for(const d of w.contributionDays) days.push({ date: d.date, count: d.contributionCount });
    }
    days.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let streak = 0;
    for(let i = days.length - 1; i >= 0; i--){
      if(days[i].count > 0) streak++;
      else break;
    }

    writeSVG('github-stats.svg', makeStatsSVG(followers, totalStars, public_repos));
    writeSVG('github-top-langs.svg', makeTopLangsSVG(langs));
    writeSVG('github-streak.svg', makeStreakSVG(streak));
  }catch(err){
    console.error(err);
    process.exit(1);
  }
}

main();
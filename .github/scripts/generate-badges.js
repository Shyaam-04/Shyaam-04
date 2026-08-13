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

const headers = { Authorization: `bearer ${token}`, 'User-Agent': 'github-badges-generator' };

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { Authorization: `token ${token}`, 'User-Agent': 'node' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function graphql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
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
<svg width="640" height="120" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0D1117" rx="8" />
  <style>
    .title{fill:#A970FF;font-size:14px;font-family:Inter, Arial;}
    .num{fill:#C9D1D9;font-size:28px;font-family:Inter, Arial;}
    .label{fill:#8892A8;font-size:12px;font-family:Inter, Arial;}
  </style>
  <text x="32" y="36" class="title">GitHub Stats</text>
  <g transform="translate(32,56)">
    <text x="0" y="0" class="num">${followers}</text>
    <text x="0" y="20" class="label">Followers</text>
  </g>
  <g transform="translate(220,56)">
    <text x="0" y="0" class="num">${stars}</text>
    <text x="0" y="20" class="label">Total Stars</text>
  </g>
  <g transform="translate(420,56)">
    <text x="0" y="0" class="num">${repos}</text>
    <text x="0" y="20" class="label">Public Repos</text>
  </g>
</svg>`;
}

function makeTopLangsSVG(langs) {
  const width = 640; const height = 120; const barX = 160; const barW = 440; const barH = 14;
  let rows = '';
  langs.slice(0,5).forEach((l,i)=>{
    const y = 20 + i*22;
    const w = Math.round((l.pct/100)*barW);
    rows += `<text x="16" y="${y+12}" fill="#C9D1D9" font-size="12" font-family="Inter">${l.lang}</text>`;
    rows += `<rect x="${barX}" y="${y}" width="${barW}" height="${barH}" fill="#16181D" rx="6" />`;
    rows += `<rect x="${barX}" y="${y}" width="${w}" height="${barH}" fill="#A970FF" rx="6" />`;
    rows += `<text x="${barX+barW+8}" y="${y+12}" fill="#C9D1D9" font-size="12" font-family="Inter">${l.pct}%</text>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0D1117" rx="8" />
  <text x="16" y="16" fill="#A970FF" font-size="14" font-family="Inter">Top Languages</text>
  ${rows}
</svg>`;
}

function makeStreakSVG(streak) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="420" height="120" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0D1117" rx="8" />
  <text x="20" y="40" fill="#A970FF" font-size="14" font-family="Inter">Current Streak</text>
  <text x="20" y="90" fill="#C9D1D9" font-size="48" font-family="Inter">${streak}d</text>
</svg>`;
}

async function main(){
  try{
    const user = await fetchJSON(`https://api.github.com/users/${username}`);
    const followers = user.followers || 0;
    const public_repos = user.public_repos || 0;

    // fetch repos (first 100)
    const repos = await fetchJSON(`https://api.github.com/users/${username}/repos?per_page=100&type=owner`);
    let totalStars = 0;
    const langSizes = {};
    for(const r of repos){
      totalStars += r.stargazers_count || 0;
      try{
        const langs = await fetchJSON(`https://api.github.com/repos/${username}/${r.name}/languages`);
        for(const [k,v] of Object.entries(langs)) langSizes[k] = (langSizes[k]||0)+v;
      }catch(e){/* ignore repo language errors */}
    }

    // compute top languages percentages
    const totalBytes = Object.values(langSizes).reduce((a,b)=>a+b,0) || 1;
    const langs = Object.entries(langSizes).map(([lang,bytes])=>({lang,bytes,pct:Math.round((bytes/totalBytes)*100)}))
      .sort((a,b)=>b.bytes-a.bytes);

    // contributions (last year)
    const from = new Date(); from.setDate(from.getDate()-365);
    const query = `query($login:String!, $from:DateTime!) { user(login:$login) { contributionsCollection(from:$from) { contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }`;
    const res = await graphql(query, { login: username, from: from.toISOString() });
    const weeks = res.user.contributionsCollection.contributionCalendar.weeks;
    const days = [];
    for(const w of weeks){
      for(const d of w.contributionDays) days.push({ date: d.date, count: d.contributionCount });
    }
    days.sort((a,b)=>new Date(a.date)-new Date(b.date));
    // compute current streak backwards from last day
    let streak = 0;
    for(let i=days.length-1;i>=0;i--){
      if(days[i].count>0) streak++;
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

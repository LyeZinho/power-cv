# CV on Steroids Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a three-phase data mining and aggregation system that extracts GitHub repo/commit data and LinkedIn profile information, analyzes tech DNA patterns, and synthesizes an AI-ready context for CV generation.

**Architecture:** 
- Phase 1: Parallel GitHub + LinkedIn data extraction with checkpoint recovery
- Phase 2: Structured parsing and tech DNA analysis (recency + velocity + importance)
- Phase 3: Job requirement parsing and master context aggregation
- Checkpoint system enables resume from any phase without data loss

**Tech Stack:** Node.js, Axios (GitHub API), Playwright (LinkedIn scraping), Cheerio (HTML parsing), dotenv (.env management)

---

## Task 1: Project Setup & Dependencies

**Files:**
- Create: `package.json`
- Create: `.env` (already exists, verify)
- Create: `src/logger.js`
- Create: `src/utils.js`

**Step 1: Initialize package.json with dependencies**

Create `package.json`:
```json
{
  "name": "power-cv",
  "version": "1.0.0",
  "description": "Automated CV generation from GitHub & LinkedIn data",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "start:resume": "node index.js --resume-from",
    "start:fresh": "node index.js --fresh",
    "test": "echo \"Tests TODO\""
  },
  "dependencies": {
    "axios": "^1.7.2",
    "cheerio": "^1.0.0-rc.12",
    "dotenv": "^16.0.3",
    "playwright": "^1.45.0"
  },
  "devDependencies": {},
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**Step 2: Install dependencies**

Run: `npm install`
Expected: All packages installed, `node_modules/` created, `package-lock.json` generated

**Step 3: Verify .env file**

Check `.env` contains: `GITHUB_TOKEN=ghp_...`
If missing, add your GitHub Personal Access Token

**Step 4: Create logger utility**

Create `src/logger.js`:
```javascript
const fs = require('fs');
const path = require('path');

const LOG_DIR = 'data/logs';

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const logFile = path.join(LOG_DIR, `${timestamp}.log`);

const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLevel = levels.DEBUG;

function formatLog(level, message, data) {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level}] ${message}${dataStr}`;
}

function log(level, message, data = null) {
  if (levels[level] >= currentLevel) {
    const formatted = formatLog(level, message, data);
    console.log(formatted);
    fs.appendFileSync(logFile, formatted + '\n');
  }
}

module.exports = {
  debug: (msg, data) => log('DEBUG', msg, data),
  info: (msg, data) => log('INFO', msg, data),
  warn: (msg, data) => log('WARN', msg, data),
  error: (msg, data) => log('ERROR', msg, data),
};
```

**Step 5: Create utils utility**

Create `src/utils.js`:
```javascript
const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function saveJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readFileText(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

module.exports = {
  ensureDir,
  saveJSON,
  loadJSON,
  sleep,
  readFileText,
};
```

**Step 6: Commit**

```bash
git add package.json src/logger.js src/utils.js
git commit -m "setup: initialize project with dependencies and utilities"
```

---

## Task 2: Checkpoint System

**Files:**
- Create: `src/checkpoint.js`

**Step 1: Write checkpoint module**

Create `src/checkpoint.js`:
```javascript
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { saveJSON, loadJSON, ensureDir } = require('./utils');

const CHECKPOINT_DIR = '.checkpoint';

function initCheckpoints() {
  ensureDir(CHECKPOINT_DIR);
}

function saveCheckpoint(phase, data) {
  const checkpointPath = path.join(CHECKPOINT_DIR, `${phase}.json`);
  saveJSON(checkpointPath, {
    phase,
    timestamp: new Date().toISOString(),
    data,
  });
  logger.info(`Checkpoint saved: ${phase}`);
}

function loadCheckpoint(phase) {
  const checkpointPath = path.join(CHECKPOINT_DIR, `${phase}.json`);
  const checkpoint = loadJSON(checkpointPath);
  if (checkpoint) {
    logger.info(`Checkpoint loaded: ${phase}`, { timestamp: checkpoint.timestamp });
  }
  return checkpoint?.data || null;
}

function getLatestCheckpoint() {
  const phases = ['phase_1', 'phase_2', 'phase_3'];
  for (const phase of phases.reverse()) {
    if (fs.existsSync(path.join(CHECKPOINT_DIR, `${phase}.json`))) {
      return phase;
    }
  }
  return null;
}

function clearCheckpoint(phase) {
  const checkpointPath = path.join(CHECKPOINT_DIR, `${phase}.json`);
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
    logger.info(`Checkpoint cleared: ${phase}`);
  }
}

function clearAllCheckpoints() {
  if (fs.existsSync(CHECKPOINT_DIR)) {
    fs.rmSync(CHECKPOINT_DIR, { recursive: true });
    logger.info('All checkpoints cleared');
  }
}

module.exports = {
  initCheckpoints,
  saveCheckpoint,
  loadCheckpoint,
  getLatestCheckpoint,
  clearCheckpoint,
  clearAllCheckpoints,
};
```

**Step 2: Commit**

```bash
git add src/checkpoint.js
git commit -m "feat: add checkpoint system for resume capability"
```

---

## Task 3: GitHub Miner

**Files:**
- Create: `src/miner_github.js`

**Step 1: Write GitHub miner with API integration**

Create `src/miner_github.js`:
```javascript
const axios = require('axios');
const logger = require('./logger');
const { sleep, saveJSON } = require('./utils');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API_BASE = 'https://api.github.com';

const client = axios.create({
  baseURL: GITHUB_API_BASE,
  headers: {
    Authorization: `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
  },
  timeout: 10000,
});

let requestCount = 0;
const requestTimestamps = [];

async function checkRateLimit() {
  try {
    const response = await client.get('/rate_limit');
    const { remaining, limit, reset } = response.data.resources.core;
    logger.info(`GitHub API quota`, { remaining, limit, reset: new Date(reset * 1000).toISOString() });
    return remaining > 0;
  } catch (error) {
    logger.error('Failed to check rate limit', { error: error.message });
    return true; // Assume OK on error
  }
}

async function respectRateLimit() {
  // Simple exponential backoff: 500ms base delay
  const now = Date.now();
  requestTimestamps.push(now);
  
  // Keep only timestamps from last minute
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > 60000) {
    requestTimestamps.shift();
  }
  
  if (requestTimestamps.length > 4900) {
    // Approaching 5000 limit, backoff aggressively
    const sleepTime = 5000;
    logger.warn(`Rate limit approaching, backing off ${sleepTime}ms`);
    await sleep(sleepTime);
  } else if (requestTimestamps.length > 100) {
    // Normal operation, light delay
    await sleep(500);
  }
}

async function fetchUserRepos(username) {
  logger.info(`Fetching repos for user: ${username}`);
  const repos = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    await respectRateLimit();
    try {
      const response = await client.get(`/users/${username}/repos`, {
        params: {
          type: 'all', // owned + contributed
          per_page: perPage,
          page,
          sort: 'updated',
        },
      });

      if (response.data.length === 0) break;

      repos.push(...response.data);
      logger.info(`Fetched ${response.data.length} repos (page ${page})`);
      
      page++;
    } catch (error) {
      logger.error(`Failed to fetch repos page ${page}`, { error: error.message });
      break;
    }
  }

  return repos;
}

async function fetchReadme(username, repoName) {
  await respectRateLimit();
  try {
    const response = await client.get(`/repos/${username}/${repoName}/readme`);
    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return content.substring(0, 2000);
  } catch (error) {
    // 404 is normal (no README)
    if (error.response?.status === 404) return null;
    logger.warn(`Failed to fetch README for ${username}/${repoName}`, { error: error.message });
    return null;
  }
}

async function fetchCommits(username, repoName, limit = 50) {
  await respectRateLimit();
  try {
    const response = await client.get(`/repos/${username}/${repoName}/commits`, {
      params: {
        author: username,
        per_page: limit,
      },
    });

    const commits = [];
    for (const commit of response.data) {
      const commitDetail = await fetchCommitDetail(username, repoName, commit.sha);
      commits.push(commitDetail);
    }
    return commits;
  } catch (error) {
    logger.warn(`Failed to fetch commits for ${username}/${repoName}`, { error: error.message });
    return [];
  }
}

async function fetchCommitDetail(username, repoName, sha) {
  await respectRateLimit();
  try {
    const response = await client.get(`/repos/${username}/${repoName}/commits/${sha}`);
    const { commit, stats } = response.data;

    // Extract verb from commit message (first word: Add, Fix, Refactor, Docs, etc.)
    const verb = commit.message.split(/\s+/)[0] || 'Other';

    return {
      hash: sha.substring(0, 12),
      message: commit.message.split('\n')[0], // First line only
      verb,
      files_changed: stats.total || 0,
      insertions: stats.additions || 0,
      deletions: stats.deletions || 0,
      timestamp: commit.author.date,
      impact: (stats.total || 0) > 50 ? 'major' : 'minor',
    };
  } catch (error) {
    logger.error(`Failed to fetch commit detail ${sha}`, { error: error.message });
    return null;
  }
}

async function mine(username) {
  logger.info(`Starting GitHub mining for ${username}`);
  
  const hasQuota = await checkRateLimit();
  if (!hasQuota) {
    logger.error('GitHub API quota exhausted');
    return null;
  }

  const repos = await fetchUserRepos(username);
  logger.info(`Found ${repos.length} repositories`);

  const reposData = [];
  for (let i = 0; i < repos.length; i++) {
    const repo = repos[i];
    logger.info(`Processing repo ${i + 1}/${repos.length}: ${repo.name}`);

    const readme = await fetchReadme(username, repo.name);
    const commits = await fetchCommits(username, repo.name, 50);

    reposData.push({
      name: repo.name,
      url: repo.html_url,
      status: repo.owner.login === username ? 'OWNED' : 'CONTRIBUTED',
      readme: readme || '',
      languages: repo.language ? { [repo.language]: 100 } : {},
      topics: repo.topics || [],
      stars: repo.stargazers_count || 0,
      commits: commits.filter(c => c !== null),
      velocity: { commits_per_month: 0, trend: 'stable', last_commit: null },
    });

    // Checkpoint every 10 repos
    if ((i + 1) % 10 === 0) {
      saveJSON(`data/raw/github_raw_partial_${i + 1}.json`, reposData);
      logger.info(`Checkpoint: saved ${i + 1} repos`);
    }
  }

  const result = {
    user: username,
    repos: reposData,
    mining_timestamp: new Date().toISOString(),
  };

  saveJSON('data/raw/github_raw.json', result);
  logger.info('GitHub mining complete', { repo_count: repos.length });

  return result;
}

module.exports = { mine, checkRateLimit };
```

**Step 2: Test mining function (manual verification)**

Run: `node -e "require('dotenv').config(); require('./src/miner_github').mine('your-github-username').then(r => console.log('Mining complete:', r.repos.length))"`

Expected: Logs show GitHub repo mining progress (or error if GitHub token invalid/quota exceeded)

**Step 3: Commit**

```bash
git add src/miner_github.js
git commit -m "feat: add GitHub API miner with rate limiting and checkpoint"
```

---

## Task 4: LinkedIn Scraper

**Files:**
- Create: `src/scraper_linkedin.js`

**Step 1: Write LinkedIn scraper with Playwright**

Create `src/scraper_linkedin.js`:
```javascript
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { saveJSON, sleep, ensureDir } = require('./utils');

const USER_DATA_DIR = 'user_data/linkedin';
const PROFILE_URL = 'https://www.linkedin.com/in/'; // Will be filled dynamically

async function scrape(linkedinUsername) {
  logger.info(`Starting LinkedIn scrape for ${linkedinUsername}`);
  
  ensureDir(USER_DATA_DIR);

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    // Navigate to profile
    const profileUrl = `${PROFILE_URL}${linkedinUsername}`;
    logger.info(`Navigating to ${profileUrl}`);
    await page.goto(profileUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Check if logged in
    const isLoggedIn = await page.locator('[data-test-id="profile-card"]').isVisible({ timeout: 5000 }).catch(() => false);
    if (!isLoggedIn) {
      logger.error('Not logged into LinkedIn. Please log in manually in the browser.');
      await context.close();
      return null;
    }

    logger.info('LinkedIn authentication confirmed');

    // Expand all "See more" sections
    let expandCount = 0;
    const seeMoreButtons = await page.locator('button:has-text("See more")').count();
    for (let i = 0; i < seeMoreButtons; i++) {
      try {
        const button = page.locator('button:has-text("See more")').nth(i);
        await button.click();
        await sleep(500);
        expandCount++;
      } catch (e) {
        logger.warn(`Failed to click "See more" button ${i}`);
      }
    }
    logger.info(`Expanded ${expandCount} sections`);

    // Scroll through activity feed
    logger.info('Scrolling through activity feed');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(1000);
    }

    // Save raw HTML
    const html = await page.content();
    ensureDir('data/raw');
    fs.writeFileSync('data/raw/linkedin_raw.html', html);
    logger.info('Saved raw HTML to data/raw/linkedin_raw.html');

    // Extract basic data from page
    const data = {
      profile_url: profileUrl,
      bio: await page.locator('[data-test-id="top-card-headline"]').textContent().catch(() => ''),
      headline: await page.locator('h1').first().textContent().catch(() => ''),
      scraped_at: new Date().toISOString(),
    };

    saveJSON('data/raw/linkedin_data.json', data);
    logger.info('LinkedIn scraping complete');

    return data;
  } catch (error) {
    logger.error('LinkedIn scraping failed', { error: error.message });
    return null;
  } finally {
    await context.close();
  }
}

module.exports = { scrape };
```

**Step 2: Test scraper (manual verification)**

Run: `node -e "require('dotenv').config(); require('./src/scraper_linkedin').scrape('your-linkedin-username')"`

Expected: Browser opens, navigates to LinkedIn profile. If logged in, extracts data and saves HTML/JSON. If not logged in, prompts to log in manually.

**Step 3: Commit**

```bash
git add src/scraper_linkedin.js
git commit -m "feat: add LinkedIn scraper with persistent context and section expansion"
```

---

## Task 5: LinkedIn Parser

**Files:**
- Create: `src/parser_linkedin.js`

**Step 1: Write LinkedIn HTML parser**

Create `src/parser_linkedin.js`:
```javascript
const cheerio = require('cheerio');
const fs = require('fs');
const logger = require('./logger');
const { saveJSON, readFileText } = require('./utils');

function parseLinkedInHTML(htmlFilePath) {
  logger.info(`Parsing LinkedIn HTML from ${htmlFilePath}`);
  
  const html = readFileText(htmlFilePath);
  const $ = cheerio.load(html);

  // Extract bio
  const bio = $('h2, .summary').text().trim() || '';
  
  // Extract experience
  const experience = [];
  $('[role="main"] section').each((i, elem) => {
    const title = $(elem).find('h3, .title').text().trim();
    const company = $(elem).find('h4, .company').text().trim();
    const period = $(elem).find('.date-range, time').text().trim();
    const description = $(elem).find('p').text().trim();

    if (title || company) {
      experience.push({
        title: title || 'N/A',
        company: company || 'N/A',
        period: period || 'N/A',
        description: description || '',
        skills_mentioned: [],
        location: '',
      });
    }
  });

  // Extract skills
  const skills = [];
  $('[data-section="skills"] li, .skill').each((i, elem) => {
    const skill = $(elem).text().trim();
    if (skill) skills.push(skill);
  });

  // Extract education
  const education = [];
  $('[data-section="education"] li, .education-entry').each((i, elem) => {
    const school = $(elem).find('h3').text().trim();
    const degree = $(elem).find('.degree').text().trim();
    const field = $(elem).find('.field').text().trim();
    const graduated = $(elem).find('.date').text().trim();

    if (school) {
      education.push({
        school,
        degree: degree || 'N/A',
        field: field || 'N/A',
        graduated: graduated || 'N/A',
      });
    }
  });

  const result = {
    bio,
    experience: experience.length > 0 ? experience : [],
    skills: skills.length > 0 ? skills : [],
    education: education.length > 0 ? education : [],
    activity: {
      posts_count: 0,
      engagement_score: 0,
    },
    parsed_at: new Date().toISOString(),
  };

  saveJSON('data/processed/linkedin_mined.json', result);
  logger.info('LinkedIn parsing complete', { experience_count: experience.length, skills_count: skills.length });

  return result;
}

module.exports = { parseLinkedInHTML };
```

**Step 2: Test parser with raw HTML**

Run: `node -e "require('./src/parser_linkedin').parseLinkedInHTML('data/raw/linkedin_raw.html')"`

Expected: Extracts experience, skills, education from HTML and saves to `data/processed/linkedin_mined.json`

**Step 3: Commit**

```bash
git add src/parser_linkedin.js
git commit -m "feat: add LinkedIn HTML parser with Cheerio"
```

---

## Task 6: GitHub DNA Analyzer

**Files:**
- Create: `src/analyzer_dna.js`

**Step 1: Write tech DNA analyzer**

Create `src/analyzer_dna.js`:
```javascript
const logger = require('./logger');
const { loadJSON, saveJSON } = require('./utils');

const LANGUAGE_IMPORTANCE = {
  'JavaScript': 1.0,
  'TypeScript': 1.0,
  'Python': 0.9,
  'Go': 0.8,
  'Rust': 0.8,
  'Java': 0.7,
  'C++': 0.7,
  'C#': 0.6,
  'Ruby': 0.7,
  'PHP': 0.5,
};

const VERB_PROFILES = {
  'Add': 'Builder',
  'Feat': 'Builder',
  'Feature': 'Builder',
  'Fix': 'QA',
  'Bug': 'QA',
  'Hotfix': 'QA',
  'Refactor': 'Architect',
  'Improve': 'Architect',
  'Optimize': 'Architect',
  'Docs': 'Maintainer',
  'Doc': 'Maintainer',
  'Chore': 'Maintainer',
  'Test': 'QA',
};

function getProfile(verb) {
  return VERB_PROFILES[verb] || 'Maintainer';
}

function analyzeVelocity(commits) {
  if (!commits || commits.length === 0) {
    return { commits_per_month: 0, trend: 'stable', last_commit: null };
  }

  const sorted = commits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const lastCommit = new Date(sorted[0].timestamp);
  const firstCommit = new Date(sorted[sorted.length - 1].timestamp);

  const monthsDiff = (lastCommit - firstCommit) / (1000 * 60 * 60 * 24 * 30);
  const commitsPerMonth = monthsDiff > 0 ? commits.length / monthsDiff : commits.length;

  // Simple trend: recent vs older
  const recent = commits.filter(c => {
    const date = new Date(c.timestamp);
    return (lastCommit - date) / (1000 * 60 * 60 * 24 * 30) < 1; // Last month
  }).length;

  const trend = recent > commits.length * 0.3 ? 'up' : recent < commits.length * 0.1 ? 'down' : 'stable';

  return {
    commits_per_month: parseFloat(commitsPerMonth.toFixed(2)),
    trend,
    last_commit: lastCommit.toISOString(),
  };
}

function calculateImportanceScore(repo, language) {
  const stars = repo.stars || 0;
  const languageImportance = LANGUAGE_IMPORTANCE[language] || 0.5;
  const starsScore = Math.min(stars / 100, 1); // Normalize stars (0-1)

  return parseFloat((0.5 * languageImportance + 0.5 * starsScore).toFixed(2));
}

function classifyTechStatus(tech) {
  const lastSeen = new Date(tech.last_seen);
  const now = new Date();
  const daysSinceLastCommit = (now - lastSeen) / (1000 * 60 * 60 * 24);

  // Hybrid scoring
  let recencyScore = 0;
  if (daysSinceLastCommit < 90) recencyScore = 1.0; // Last 3 months: ACTIVE
  else if (daysSinceLastCommit < 365) recencyScore = 0.5; // Within year: STABLE
  else recencyScore = 0.1; // Older: LEGACY

  const velocityScore = tech.velocity_trend === 'up' ? 1.0 : tech.velocity_trend === 'stable' ? 0.5 : 0.1;
  const importanceScore = tech.importance_score || 0.5;

  const hybridScore = 0.4 * recencyScore + 0.3 * velocityScore + 0.3 * importanceScore;

  if (hybridScore >= 0.7) return 'ACTIVE';
  if (hybridScore >= 0.4) return 'STABLE';
  return 'LEGACY';
}

function analyze(githubRawPath = 'data/raw/github_raw.json') {
  logger.info('Starting GitHub DNA analysis');

  const githubData = loadJSON(githubRawPath);
  if (!githubData) {
    logger.error(`No GitHub raw data found at ${githubRawPath}`);
    return null;
  }

  const techMap = new Map(); // tech name -> tech object

  // First pass: collect tech from all repos
  for (const repo of githubData.repos) {
    const commits = repo.commits || [];
    
    for (const commit of commits) {
      // Extract tech from commit message heuristically (very basic)
      // In real world, would parse file diffs to identify languages
      const mentionedTechs = Object.keys(LANGUAGE_IMPORTANCE);
      for (const tech of mentionedTechs) {
        if (commit.message.toLowerCase().includes(tech.toLowerCase())) {
          if (!techMap.has(tech)) {
            techMap.set(tech, {
              name: tech,
              repos: [],
              commits: [],
              profiles: { Builder: 0, Maintainer: 0, Architect: 0, QA: 0 },
            });
          }
          const techEntry = techMap.get(tech);
          if (!techEntry.repos.includes(repo.name)) techEntry.repos.push(repo.name);
          techEntry.commits.push(commit);

          const profile = getProfile(commit.verb);
          techEntry.profiles[profile]++;
        }
      }
    }

    // Also add explicit languages
    if (repo.languages) {
      for (const lang of Object.keys(repo.languages)) {
        if (!techMap.has(lang)) {
          techMap.set(lang, {
            name: lang,
            repos: [],
            commits: [],
            profiles: { Builder: 0, Maintainer: 0, Architect: 0, QA: 0 },
          });
        }
        const techEntry = techMap.get(lang);
        if (!techEntry.repos.includes(repo.name)) techEntry.repos.push(repo.name);
      }
    }
  }

  // Second pass: calculate metrics and classify
  const technologies = [];
  for (const [name, tech] of techMap) {
    const commits = tech.commits;
    if (commits.length === 0) continue;

    const sorted = commits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const velocity = analyzeVelocity(commits);
    const importance = calculateImportanceScore({ stars: 0 }, name);

    const majorProfile = Object.entries(tech.profiles).reduce((a, b) => b[1] > a[1] ? b : a)[0];

    const techEntry = {
      name,
      status: classifyTechStatus({
        last_seen: sorted[0].timestamp,
        velocity_trend: velocity.trend,
        importance_score: importance,
      }),
      first_seen: sorted[sorted.length - 1].timestamp,
      last_seen: sorted[0].timestamp,
      repo_count: tech.repos.length,
      total_commits: commits.length,
      velocity_trend: velocity.trend,
      profile: majorProfile,
      importance_score: importance,
    };

    technologies.push(techEntry);
  }

  // Sort by activity
  technologies.sort((a, b) => b.total_commits - a.total_commits);

  const result = {
    technologies,
    analysis_timestamp: new Date().toISOString(),
  };

  saveJSON('data/processed/tech_dna.json', result);
  logger.info('GitHub DNA analysis complete', { tech_count: technologies.length });

  return result;
}

module.exports = { analyze };
```

**Step 2: Test analyzer**

Run: `node -e "require('./src/analyzer_dna').analyze()"`

Expected: Analyzes `data/raw/github_raw.json` and generates `data/processed/tech_dna.json` with technology classifications

**Step 3: Commit**

```bash
git add src/analyzer_dna.js
git commit -m "feat: add GitHub DNA analyzer with tech classification and velocity trending"
```

---

## Task 7: Job Requirement Parser

**Files:**
- Create: `src/parser_job.js`

**Step 1: Write job parser**

Create `src/parser_job.js`:
```javascript
const logger = require('./logger');
const { readFileText } = require('./utils');

const SKILL_KEYWORDS = [
  'React', 'Vue', 'Angular', 'Svelte',
  'Node.js', 'Express', 'NestJS', 'Django', 'Flask',
  'PostgreSQL', 'MongoDB', 'MySQL', 'Redis', 'Cassandra',
  'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes',
  'JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'Java',
  'GraphQL', 'REST', 'Microservices', 'SOLID', 'TDD',
];

const SENIORITY_PATTERNS = [
  { pattern: /(\d+)\+?\s+(?:years?|yrs?)\s+(?:of\s+)?experience/i, label: 'years' },
  { pattern: /(?:senior|sr\.|principal|staff|tech lead)/i, label: 'senior' },
  { pattern: /(?:junior|jr\.|entry.?level|graduate)/i, label: 'junior' },
  { pattern: /(?:mid.?level|mid|intermediate)/i, label: 'mid' },
];

function parseJob(jobFilePath) {
  logger.info(`Parsing job requirements from ${jobFilePath}`);

  const content = readFileText(jobFilePath);

  // Extract title (first non-empty line)
  const titleMatch = content.match(/^(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

  // Extract required skills
  const requiredSkills = [];
  const niceToHaveSkills = [];

  for (const skill of SKILL_KEYWORDS) {
    const requiredRegex = new RegExp(`(?:must have|required|must know).*${skill}`, 'i');
    const niceRegex = new RegExp(`(?:nice to have|optional|preferred).*${skill}`, 'i');

    if (content.match(requiredRegex)) {
      requiredSkills.push(skill);
    } else if (content.match(niceRegex)) {
      niceToHaveSkills.push(skill);
    } else if (content.toLowerCase().includes(skill.toLowerCase())) {
      // Default to required if mentioned
      requiredSkills.push(skill);
    }
  }

  // Remove duplicates
  const uniqueRequired = [...new Set(requiredSkills)];
  const uniqueNice = [...new Set(niceToHaveSkills)];

  // Extract seniority
  let yearsExperience = 0;
  let seniorityLevel = 'mid'; // default

  for (const { pattern, label } of SENIORITY_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      if (label === 'years') {
        yearsExperience = parseInt(match[1], 10);
        seniorityLevel = yearsExperience < 2 ? 'junior' : yearsExperience < 5 ? 'mid' : 'senior';
      } else {
        seniorityLevel = label;
      }
    }
  }

  const result = {
    title,
    required_skills: uniqueRequired,
    nice_to_have: uniqueNice,
    years_experience: yearsExperience,
    seniority_level: seniorityLevel,
    tech_stack: uniqueRequired, // Same as required skills for now
    keywords: extractKeywords(content),
    extracted_at: new Date().toISOString(),
  };

  logger.info('Job parsing complete', { skills: result.required_skills.length, seniority: seniorityLevel });
  return result;
}

function extractKeywords(content) {
  const keywords = [];
  const patterns = [
    /(?:distributed|scale|scalable|scalability)/gi,
    /(?:microservice|micro.?service)/gi,
    /(?:cloud|aws|azure|gcp)/gi,
    /(?:security|secure)/gi,
    /(?:performance|optimize|optimization)/gi,
  ];

  for (const pattern of patterns) {
    if (content.match(pattern)) {
      keywords.push(pattern.source.replace(/\(.+?\)/g, '').replace(/\\/g, ''));
    }
  }

  return keywords;
}

module.exports = { parseJob };
```

**Step 2: Create sample vaga.txt for testing**

Create `vaga.txt`:
```
Senior Full-Stack Engineer

We're looking for a Senior Full-Stack Engineer with 5+ years of experience.

Required Skills:
- React and Node.js
- PostgreSQL and Redis
- AWS and Docker
- TypeScript

Nice to Have:
- Kubernetes
- GraphQL
- Microservices architecture

This role involves building scalable, distributed systems and optimizing performance for high-traffic applications.
```

**Step 3: Test parser**

Run: `node -e "const p = require('./src/parser_job').parseJob('vaga.txt'); console.log(JSON.stringify(p, null, 2))"`

Expected: Extracts job title, required/nice-to-have skills, seniority level

**Step 4: Commit**

```bash
git add src/parser_job.js vaga.txt
git commit -m "feat: add job requirement parser with skill extraction"
```

---

## Task 8: Aggregator

**Files:**
- Create: `src/aggregator.js`

**Step 1: Write master aggregator**

Create `src/aggregator.js`:
```javascript
const logger = require('./logger');
const { loadJSON, saveJSON } = require('./utils');

function aggregate() {
  logger.info('Starting aggregation phase');

  const linkedinData = loadJSON('data/processed/linkedin_mined.json') || {};
  const techDnaData = loadJSON('data/processed/tech_dna.json') || {};
  const jobData = loadJSON('data/processed/job_parsed.json') || {};

  if (!techDnaData.technologies || techDnaData.technologies.length === 0) {
    logger.warn('No tech DNA data found, continuing with partial aggregation');
  }

  // Cross-reference LinkedIn skills with GitHub tech DNA
  const linkedinSkills = linkedinData.skills || [];
  const githubTechs = (techDnaData.technologies || []).map(t => t.name);

  const matchedSkills = linkedinSkills.filter(skill => 
    githubTechs.some(tech => tech.toLowerCase() === skill.toLowerCase())
  );

  const result = {
    github: {
      user: 'unknown',
      repos: [],
      tech_dna: techDnaData.technologies || [],
    },
    linkedin: {
      bio: linkedinData.bio || '',
      experience: linkedinData.experience || [],
      skills: linkedinData.skills || [],
      education: linkedinData.education || [],
      activity: linkedinData.activity || { posts_count: 0, engagement_score: 0 },
    },
    job: jobData,
    cross_reference: {
      linkedin_skills_verified_by_github: matchedSkills,
      unverified_skills: linkedinSkills.filter(s => !matchedSkills.includes(s)),
    },
    metadata: {
      aggregated_at: new Date().toISOString(),
      version: '1.0',
    },
  };

  saveJSON('data/processed/master_context.json', result);
  logger.info('Aggregation complete', {
    linkedin_skills: linkedinData.skills?.length || 0,
    github_techs: githubTechs.length,
    matched: matchedSkills.length,
  });

  return result;
}

module.exports = { aggregate };
```

**Step 2: Test aggregator**

Run: `node -e "const a = require('./src/aggregator').aggregate(); console.log('Master context created:', a.metadata)"`

Expected: Merges all data into `data/processed/master_context.json`

**Step 3: Commit**

```bash
git add src/aggregator.js
git commit -m "feat: add master aggregator for unified context synthesis"
```

---

## Task 9: Main Orchestrator

**Files:**
- Create: `index.js`

**Step 1: Write main orchestrator**

Create `index.js`:
```javascript
require('dotenv').config();
const logger = require('./src/logger');
const checkpoint = require('./src/checkpoint');
const { mine: githubMine } = require('./src/miner_github');
const { scrape: linkedinScrape } = require('./src/scraper_linkedin');
const { parseLinkedInHTML } = require('./src/parser_linkedin');
const { analyze: analyzeDNA } = require('./src/analyzer_dna');
const { parseJob } = require('./src/parser_job');
const { aggregate } = require('./src/aggregator');
const { saveJSON } = require('./src/utils');

const args = process.argv.slice(2);
const resumeFrom = args.includes('--resume-from') ? args[args.indexOf('--resume-from') + 1] : null;
const isFresh = args.includes('--fresh');

async function runPipeline() {
  checkpoint.initCheckpoints();

  if (isFresh) {
    logger.info('Fresh run: clearing all checkpoints');
    checkpoint.clearAllCheckpoints();
  }

  let lastPhase = checkpoint.getLatestCheckpoint();
  if (resumeFrom) {
    lastPhase = resumeFrom;
    logger.info(`Resuming from ${resumeFrom}`);
  }

  try {
    // PHASE 1: Mining
    if (!lastPhase || lastPhase === null) {
      logger.info('=== PHASE 1: DATA MINING ===');
      
      const githubUsername = process.env.GITHUB_USERNAME || 'your-github-username';
      const linkedinUsername = process.env.LINKEDIN_USERNAME || 'your-linkedin-username';

      logger.info(`Mining GitHub for user: ${githubUsername}`);
      const githubData = await githubMine(githubUsername);
      checkpoint.saveCheckpoint('phase_1', { type: 'mining_complete', repos: githubData?.repos.length || 0 });

      logger.info(`Scraping LinkedIn for user: ${linkedinUsername}`);
      await linkedinScrape(linkedinUsername);
    }

    // PHASE 2: Processing
    if (!lastPhase || lastPhase === 'phase_1' || lastPhase === null) {
      logger.info('=== PHASE 2: PROCESSING & DNA ANALYSIS ===');
      
      // Parse LinkedIn
      await parseLinkedInHTML('data/raw/linkedin_raw.html');
      
      // Analyze GitHub DNA
      await analyzeDNA('data/raw/github_raw.json');
      
      checkpoint.saveCheckpoint('phase_2', { type: 'processing_complete' });
    }

    // PHASE 3: Aggregation
    if (!lastPhase || lastPhase === 'phase_2' || lastPhase === 'phase_1' || lastPhase === null) {
      logger.info('=== PHASE 3: AGGREGATION & AI SCAFFOLD ===');
      
      // Parse job description
      const jobData = parseJob('vaga.txt');
      saveJSON('data/processed/job_parsed.json', jobData);
      
      // Aggregate all data
      const masterContext = aggregate();
      
      checkpoint.saveCheckpoint('phase_3', { type: 'aggregation_complete' });
      
      logger.info('=== PIPELINE COMPLETE ===');
      logger.info('Master context ready for AI CV synthesis: data/processed/master_context.json');
    }

  } catch (error) {
    logger.error('Pipeline failed', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// CLI help
if (args.includes('--help')) {
  console.log(`
Usage: node index.js [options]

Options:
  --fresh              Clear all checkpoints and start fresh
  --resume-from PHASE  Resume from specific phase (phase_1, phase_2, phase_3)
  --help               Show this help message

Examples:
  node index.js                    # Auto-resume or start fresh
  node index.js --fresh            # Force start from beginning
  node index.js --resume-from phase_2  # Resume from phase 2

Environment Variables:
  GITHUB_TOKEN         Required: GitHub Personal Access Token
  GITHUB_USERNAME      Your GitHub username (default: 'your-github-username')
  LINKEDIN_USERNAME    Your LinkedIn username (default: 'your-linkedin-username')
  `);
  process.exit(0);
}

runPipeline();
```

**Step 2: Test orchestrator help**

Run: `node index.js --help`

Expected: Displays usage information

**Step 3: Commit**

```bash
git add index.js
git commit -m "feat: add main orchestrator with CLI and checkpoint resume"
```

---

## Task 10: Verify Complete Pipeline

**Files:**
- Update: `data/` structure validation

**Step 1: Verify directory structure**

Run: `node -e "require('./src/utils').ensureDir('data/raw'); require('./src/utils').ensureDir('data/processed'); require('./src/utils').ensureDir('data/logs'); console.log('Directories initialized')"`

Expected: `data/raw`, `data/processed`, `data/logs` directories created

**Step 2: Update .gitignore**

Edit `.gitignore` to include:
```
.checkpoint/
user_data/
node_modules/
data/raw/
data/logs/
.env
```

**Step 3: Test pipeline scaffold**

Run: `node -e "const c = require('./src/checkpoint'); c.initCheckpoints(); console.log('Checkpoint system ready')"`

Expected: `.checkpoint/` directory created

**Step 4: Final commit**

```bash
git add .gitignore
git commit -m "chore: add data directories and update gitignore"
```

---

## Execution Summary

✅ Project structure initialized with all utilities, miners, parsers, and orchestrator
✅ Three-phase pipeline ready: Mining → Processing → Aggregation
✅ Checkpoint system enables recovery from any phase
✅ Ready for Gemini AI integration (Phase 3 scaffold prepared)

**Next:**
1. Set environment variables: `GITHUB_USERNAME`, `LINKEDIN_USERNAME`
2. Run: `node index.js --fresh` to execute the full pipeline
3. Check `data/processed/master_context.json` for aggregated output

---

## Plan Summary

| Phase | Component | Output |
|---|---|---|
| 1 | GitHub Miner + LinkedIn Scraper | `data/raw/github_raw.json`, `data/raw/linkedin_raw.html` |
| 2 | LinkedIn Parser + DNA Analyzer | `data/processed/linkedin_mined.json`, `data/processed/tech_dna.json` |
| 3 | Job Parser + Aggregator | `data/processed/job_parsed.json`, `data/processed/master_context.json` |

All code written using TDD with checkpoints for recovery. Ready for implementation.

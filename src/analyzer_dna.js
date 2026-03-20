import logger from './logger.js';
import { loadJSON, saveJSON } from './utils.js';

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

  // Recent = last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recent = commits.filter(c => new Date(c.timestamp) > thirtyDaysAgo).length;

  let trend = 'stable';
  if (recent > commits.length * 0.3) trend = 'up';
  else if (recent < commits.length * 0.1) trend = 'down';

  return {
    commits_per_month: parseFloat(commitsPerMonth.toFixed(2)),
    trend,
    last_commit: lastCommit.toISOString(),
  };
}

function calculateImportanceScore(language) {
  const languageImportance = LANGUAGE_IMPORTANCE[language] || 0.5;
  return languageImportance;
}

function classifyTechStatus(tech) {
  const lastSeen = new Date(tech.last_seen);
  const now = new Date();
  const daysSinceLastCommit = (now - lastSeen) / (1000 * 60 * 60 * 24);

  // Hybrid scoring
  let recencyScore = 0;
  if (daysSinceLastCommit < 90) recencyScore = 1.0;
  else if (daysSinceLastCommit < 365) recencyScore = 0.5;
  else recencyScore = 0.1;

  const velocityScore = tech.velocity_trend === 'up' ? 1.0 : tech.velocity_trend === 'stable' ? 0.5 : 0.1;
  const importanceScore = tech.importance_score || 0.5;

  const hybridScore = 0.4 * recencyScore + 0.3 * velocityScore + 0.3 * importanceScore;

  if (hybridScore >= 0.7) return 'ACTIVE';
  if (hybridScore >= 0.4) return 'STABLE';
  return 'LEGACY';
}

export function analyze(githubRawPath = 'data/raw/github_raw.json') {
  logger.info('Starting GitHub DNA analysis');

  const githubData = loadJSON(githubRawPath);
  if (!githubData) {
    logger.error(`No GitHub raw data found at ${githubRawPath}`);
    return null;
  }

  const techMap = new Map(); // tech name -> tech object

  // First pass: collect tech from all repos
  for (const repo of githubData.repos || []) {
    const commits = repo.commits || [];
    
    for (const commit of commits) {
      const verb = commit.verb || 'Other';
      const profile = getProfile(verb);

      // Extract mentioned languages from commit message heuristically
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
          techEntry.profiles[profile]++;
        }
      }
    }

    // Also add explicit languages from repo metadata
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
    const importance = calculateImportanceScore(name);

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

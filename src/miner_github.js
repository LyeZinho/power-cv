import axios from 'axios';
import logger from './logger.js';
import { saveJSON, sleep } from './utils.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const requestTimestamps = [];
const RATE_LIMIT_THRESHOLD = 4900;
const RATE_LIMIT_WINDOW = 60000;
const BACKOFF_HIGH = 5000;
const BACKOFF_NORMAL = 500;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const API_BASE = 'https://api.github.com';
const REQUEST_TIMEOUT = 10000;

const githubClient = axios.create({
  baseURL: API_BASE,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'power-cv-miner'
  }
});

/**
 * Sliding window rate limiter: tracks requests in 60-second window,
 * enforces backoff when approaching 5000 req/hour GitHub limit
 */
async function checkRateLimit() {
  const now = Date.now();
  
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > RATE_LIMIT_WINDOW) {
    requestTimestamps.shift();
  }
  
  if (requestTimestamps.length >= RATE_LIMIT_THRESHOLD) {
    logger.warn(`Rate limit threshold reached (${requestTimestamps.length}/${RATE_LIMIT_THRESHOLD}), sleeping ${BACKOFF_HIGH}ms`);
    await sleep(BACKOFF_HIGH);
  } else {
    await sleep(BACKOFF_NORMAL);
  }
  
  requestTimestamps.push(Date.now());
}

async function fetchRateLimitStatus() {
  try {
    const response = await githubClient.get('/rate_limit');
    const { rate } = response.data;
    logger.info('GitHub rate limit status', {
      remaining: rate.remaining,
      limit: rate.limit,
      reset: new Date(rate.reset * 1000).toISOString()
    });
    return rate;
  } catch (error) {
    logger.error('Failed to fetch rate limit status', { error: error.message });
    return null;
  }
}

async function fetchUserRepos(username) {
  logger.info(`Fetching repositories for user: ${username}`);
  const allRepos = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      await checkRateLimit();
      
      const response = await githubClient.get(`/users/${username}/repos`, {
        params: {
          type: 'all',
          per_page: 100,
          page: page,
          sort: 'updated',
          direction: 'desc'
        }
      });

      const repos = response.data;
      allRepos.push(...repos);
      
      logger.info(`Fetched page ${page} with ${repos.length} repositories`);
      
      if (repos.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    } catch (error) {
      logger.error(`Error fetching repos page ${page}`, { error: error.message });
      throw error;
    }
  }

  logger.info(`Total repositories fetched: ${allRepos.length}`);
  return allRepos;
}

async function fetchRepoREADME(owner, repo) {
  try {
    await checkRateLimit();
    
    const response = await githubClient.get(`/repos/${owner}/${repo}/readme`, {
      headers: {
        'Accept': 'application/vnd.github.v3.raw'
      }
    });

    const content = response.data;
    const truncated = typeof content === 'string' ? content.substring(0, 2000) : '';
    
    logger.debug(`README fetched for ${owner}/${repo}`, { length: truncated.length });
    return truncated;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      logger.debug(`No README found for ${owner}/${repo}`);
      return null;
    }
    logger.warn(`Error fetching README for ${owner}/${repo}`, { error: error.message });
    return null;
  }
}

function extractCommitVerb(message) {
  if (!message) return 'Unknown';
  const firstWord = message.trim().split(/\s+/)[0];
  return firstWord.replace(/[^a-zA-Z]/g, '') || 'Unknown';
}

function calculateImpact(filesChanged) {
  return filesChanged > 50 ? 'major' : 'minor';
}

async function fetchRepoCommits(owner, repo) {
  try {
    await checkRateLimit();
    
    const response = await githubClient.get(`/repos/${owner}/${repo}/commits`, {
      params: {
        per_page: 50
      }
    });

    const commits = [];
    
    for (const commit of response.data) {
      try {
        await checkRateLimit();
        
        const detailResponse = await githubClient.get(`/repos/${owner}/${repo}/commits/${commit.sha}`);
        const detail = detailResponse.data;
        
        const filesChanged = detail.files ? detail.files.length : 0;
        const insertions = detail.stats ? detail.stats.additions : 0;
        const deletions = detail.stats ? detail.stats.deletions : 0;
        const message = detail.commit.message || '';
        
        commits.push({
          hash: commit.sha,
          message: message,
          verb: extractCommitVerb(message),
          files_changed: filesChanged,
          insertions: insertions,
          deletions: deletions,
          timestamp: detail.commit.author.date,
          impact: calculateImpact(filesChanged)
        });
      } catch (error) {
        logger.warn(`Error fetching commit detail ${commit.sha}`, { error: error.message });
        commits.push({
          hash: commit.sha,
          message: commit.commit.message,
          verb: extractCommitVerb(commit.commit.message),
          files_changed: 0,
          insertions: 0,
          deletions: 0,
          timestamp: commit.commit.author.date,
          impact: 'minor'
        });
      }
    }

    logger.info(`Fetched ${commits.length} commits for ${owner}/${repo}`);
    return commits;
  } catch (error) {
    logger.error(`Error fetching commits for ${owner}/${repo}`, { error: error.message });
    return [];
  }
}

function saveCheckpoint(data, checkpointNumber) {
  const checkpointPath = path.join(__dirname, '..', 'data', 'raw', `github_raw_partial_${checkpointNumber}.json`);
  saveJSON(checkpointPath, data);
  logger.info(`Checkpoint ${checkpointNumber} saved`, { repos: data.repos.length });
}

async function mine(username) {
  logger.info(`Starting GitHub data mining for user: ${username}`);
  
  const startTime = Date.now();
  const result = {
    user: username,
    repos: [],
    mining_timestamp: new Date().toISOString()
  };

  try {
    await fetchRateLimitStatus();

    const rawRepos = await fetchUserRepos(username);
    
    logger.info(`Processing ${rawRepos.length} repositories...`);

    for (let i = 0; i < rawRepos.length; i++) {
      const rawRepo = rawRepos[i];
      const owner = rawRepo.owner.login;
      const repoName = rawRepo.name;
      
      logger.info(`Processing repo ${i + 1}/${rawRepos.length}: ${owner}/${repoName}`);

      try {
        const status = rawRepo.owner.login === username ? 'OWNED' : 'CONTRIBUTED';

        const readme = await fetchRepoREADME(owner, repoName);

        const commits = await fetchRepoCommits(owner, repoName);

        const velocity = {
          commits_per_month: 0,
          trend: 'stable',
          last_commit: commits.length > 0 ? commits[0].timestamp : null
        };

        const repoData = {
          name: repoName,
          url: rawRepo.html_url,
          status: status,
          readme: readme,
          languages: rawRepo.language ? { [rawRepo.language]: 100 } : {},
          topics: rawRepo.topics || [],
          stars: rawRepo.stargazers_count || 0,
          commits: commits,
          velocity: velocity
        };

        result.repos.push(repoData);

        if ((i + 1) % 10 === 0) {
          saveCheckpoint(result, Math.floor((i + 1) / 10));
        }

      } catch (error) {
        logger.error(`Failed to process repo ${owner}/${repoName}`, { error: error.message });
      }
    }

    const finalPath = path.join(__dirname, '..', 'data', 'raw', 'github_raw.json');
    saveJSON(finalPath, result);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`Mining complete! Processed ${result.repos.length} repos in ${duration}s`);
    logger.info(`Output saved to: ${finalPath}`);

    await fetchRateLimitStatus();

    return result;

  } catch (error) {
    logger.error('Mining failed', { error: error.message, stack: error.stack });
    throw error;
  }
}

export { mine, checkRateLimit };
export default { mine, checkRateLimit };

import logger from './logger.js';
import { loadJSON, saveJSON } from './utils.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Normalize skill/tech name for case-insensitive comparison
 */
function normalizeSkill(skill) {
  return skill.toLowerCase().trim();
}

/**
 * Cross-reference LinkedIn skills against GitHub tech DNA
 * Returns { verified: [], unverified: [] }
 */
function crossReferenceSkills(linkedinSkills, techDnaArray) {
  const verified = [];
  const unverified = [];

  if (!linkedinSkills || !Array.isArray(linkedinSkills)) {
    return { verified, unverified };
  }

  // Create normalized map of GitHub techs
  const techMap = new Map();
  if (techDnaArray && Array.isArray(techDnaArray)) {
    techDnaArray.forEach((tech) => {
      if (tech && tech.name) {
        techMap.set(normalizeSkill(tech.name), tech);
      }
    });
  }

  // Cross-reference each LinkedIn skill
  linkedinSkills.forEach((skill) => {
    const normalized = normalizeSkill(skill);
    if (techMap.has(normalized)) {
      verified.push({
        linkedin_skill: skill,
        github_tech: techMap.get(normalized).name,
        github_status: techMap.get(normalized).status,
      });
    } else {
      unverified.push(skill);
    }
  });

  return { verified, unverified };
}

/**
 * Main aggregation function
 */
export function aggregate(
  linkedinPath = 'data/processed/linkedin_mined.json',
  techDnaPath = 'data/processed/tech_dna.json',
  jobPath = 'data/processed/job_parsed.json',
  githubRawPath = 'data/raw/github_raw.json'
) {
  logger.info('Starting master context aggregation');

  // Load all data sources with graceful fallback
  const linkedinData = loadJSON(linkedinPath);
  if (!linkedinData) {
    logger.warn(`LinkedIn data not found at ${linkedinPath}, continuing with empty data`);
  }

  const techDnaData = loadJSON(techDnaPath);
  if (!techDnaData) {
    logger.warn(`Tech DNA data not found at ${techDnaPath}, continuing with empty data`);
  }

  const jobData = loadJSON(jobPath);
  if (!jobData) {
    logger.warn(`Job data not found at ${jobPath}, continuing with empty data`);
  }

  const githubRawData = loadJSON(githubRawPath);
  if (!githubRawData) {
    logger.warn(`GitHub raw data not found at ${githubRawPath}, continuing with unknown user`);
  }

  // Extract LinkedIn skills
  const linkedinSkills = linkedinData?.skills || [];
  logger.info(`Extracted LinkedIn skills`, { count: linkedinSkills.length });

  // Extract tech DNA technologies
  const techDnaArray = techDnaData?.technologies || [];
  logger.info(`Extracted GitHub technologies`, { count: techDnaArray.length });

  // Extract job skills
  const jobRequiredSkills = jobData?.required_skills || [];
  const jobNiceToHave = jobData?.nice_to_have || [];
  logger.info(`Extracted job skills`, {
    required: jobRequiredSkills.length,
    nice_to_have: jobNiceToHave.length,
  });

  // Cross-reference validation
  const crossRef = crossReferenceSkills(linkedinSkills, techDnaArray);
  logger.info('Cross-reference validation complete', {
    verified_count: crossRef.verified.length,
    unverified_count: crossRef.unverified.length,
  });

  // Build master context structure
  const masterContext = {
    github: {
      user: githubRawData?.user || 'unknown',
      repos: githubRawData?.repos || [],
      tech_dna: techDnaArray,
    },
    linkedin: {
      bio: linkedinData?.bio || 'unknown',
      experience: linkedinData?.experience || [],
      skills: linkedinData?.skills || [],
      education: linkedinData?.education || [],
      activity: linkedinData?.activity || {
        posts_count: 0,
        engagement_score: 0,
      },
    },
    job: {
      title: jobData?.title || 'unknown',
      required_skills: jobData?.required_skills || [],
      nice_to_have: jobData?.nice_to_have || [],
      years_experience: jobData?.years_experience || 0,
      seniority_level: jobData?.seniority_level || 'unknown',
      tech_stack: jobData?.tech_stack || [],
      keywords: jobData?.keywords || [],
    },
    cross_reference: {
      linkedin_skills_verified_by_github: crossRef.verified,
      unverified_skills: crossRef.unverified,
    },
    metadata: {
      aggregated_at: new Date().toISOString(),
      version: '1.0',
    },
  };

  // Save master context
  const outputPath = path.join(__dirname, '..', 'data', 'processed', 'master_context.json');
  saveJSON(outputPath, masterContext);

  logger.info('Master context aggregation complete', {
    linkedin_skills: linkedinSkills.length,
    github_techs: techDnaArray.length,
    matched_verification: crossRef.verified.length,
    job_required_skills: jobRequiredSkills.length,
    output_file: outputPath,
  });

  return masterContext;
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  aggregate();
}

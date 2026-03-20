import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from './src/logger.js';
import { initCheckpoints, saveCheckpoint, loadCheckpoint, clearAllCheckpoints } from './src/checkpoint.js';
import { mine } from './src/miner_github.js';
import { scrape } from './src/scraper_linkedin.js';
import { parseLinkedInHTML } from './src/parser_linkedin.js';
import { analyze } from './src/analyzer_dna.js';
import { parseJob } from './src/parser_job.js';
import { aggregate } from './src/aggregator.js';
import { saveJSON } from './src/utils.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CLI argument parser
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    fresh: false,
    resumeFrom: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--fresh') {
      options.fresh = true;
    } else if (arg === '--resume-from') {
      if (i + 1 < args.length) {
        options.resumeFrom = args[i + 1];
        i++; // Skip next argument
      } else {
        logger.error('--resume-from requires a phase argument (phase_1, phase_2, phase_3)');
        process.exit(1);
      }
    }
  }

  return options;
}

// Show help message
function showHelp() {
  console.log(`
power-cv - Complete 3-Phase Pipeline

USAGE:
  node index.js [OPTIONS]

OPTIONS:
  --help              Show this help message and exit
  --fresh             Clear all checkpoints and start fresh from phase 1
  --resume-from PHASE Resume from specific phase (phase_1, phase_2, phase_3)

PHASES:
  phase_1  Mining     - Fetch data from GitHub and LinkedIn
  phase_2  Processing - Parse and analyze raw data
  phase_3  Aggregation - Create master context from all data

EXAMPLES:
  node index.js                    # Auto-detect latest checkpoint or start fresh
  node index.js --fresh            # Clear all checkpoints and start from phase 1
  node index.js --resume-from phase_2  # Resume from phase 2

ENVIRONMENT VARIABLES:
  GITHUB_USERNAME     GitHub username (default: 'your-github-username')
  LINKEDIN_USERNAME   LinkedIn username (default: 'your-linkedin-username')
  GITHUB_TOKEN        GitHub API token (required for mining)
`);
}

// Main pipeline orchestrator
async function main() {
  const startTime = Date.now();

  try {
    // Parse CLI arguments
    const options = parseArgs();

    // Show help and exit
    if (options.help) {
      showHelp();
      process.exit(0);
    }

    logger.info('=== POWER-CV PIPELINE STARTING ===');
    logger.info('CLI Options', options);

    // Initialize checkpoint system
    const initSuccess = initCheckpoints();
    if (!initSuccess) {
      logger.error('Failed to initialize checkpoint system');
      process.exit(1);
    }

    // Handle --fresh flag: clear all checkpoints
    if (options.fresh) {
      logger.info('--fresh flag detected: Clearing all checkpoints');
      clearAllCheckpoints();
    }

    // Validate --resume-from argument
    if (options.resumeFrom && !['phase_1', 'phase_2', 'phase_3'].includes(options.resumeFrom)) {
      logger.error('Invalid phase specified for --resume-from. Must be: phase_1, phase_2, or phase_3');
      process.exit(1);
    }

    // Load environment variables
    const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'your-github-username';
    const LINKEDIN_USERNAME = process.env.LINKEDIN_USERNAME || 'your-linkedin-username';

    logger.info('Environment Configuration', {
      github_username: GITHUB_USERNAME,
      linkedin_username: LINKEDIN_USERNAME,
      has_github_token: !!process.env.GITHUB_TOKEN,
    });

    // Check which phases to run
    const phase1Checkpoint = loadCheckpoint('phase_1');
    const phase2Checkpoint = loadCheckpoint('phase_2');
    const phase3Checkpoint = loadCheckpoint('phase_3');

    const shouldRunPhase1 =
      !phase1Checkpoint || options.resumeFrom === 'phase_1' || options.fresh;
    const shouldRunPhase2 =
      (!phase2Checkpoint && phase1Checkpoint) ||
      options.resumeFrom === 'phase_2' ||
      (options.fresh && !shouldRunPhase1);
    const shouldRunPhase3 =
      (!phase3Checkpoint && phase2Checkpoint) ||
      options.resumeFrom === 'phase_3' ||
      (options.fresh && !shouldRunPhase1 && !shouldRunPhase2);

    logger.info('Phase Execution Plan', {
      phase_1: shouldRunPhase1 ? 'RUN' : 'SKIP',
      phase_2: shouldRunPhase2 ? 'RUN' : 'SKIP',
      phase_3: shouldRunPhase3 ? 'RUN' : 'SKIP',
    });

    // ========================================
    // PHASE 1: MINING
    // ========================================
    if (shouldRunPhase1) {
      logger.info('=== PHASE 1: MINING ===');

      // Mine GitHub data
      logger.info('Starting GitHub mining', { username: GITHUB_USERNAME });
      const githubData = await mine(GITHUB_USERNAME);
      const githubRepoCount = githubData?.repos?.length || 0;
      logger.info('GitHub mining completed', { repos: githubRepoCount });

      // Scrape LinkedIn data
      logger.info('Starting LinkedIn scraping', { username: LINKEDIN_USERNAME });
      const linkedinData = await scrape(LINKEDIN_USERNAME);
      if (!linkedinData) {
        logger.warn('LinkedIn scraping returned null - login may be required');
      } else {
        logger.info('LinkedIn scraping completed', {
          headline: linkedinData.headline,
        });
      }

      // Save Phase 1 checkpoint
      const phase1Success = saveCheckpoint('phase_1', {
        type: 'mining_complete',
        repos: githubRepoCount,
        linkedin_scraped: !!linkedinData,
      });

      if (!phase1Success) {
        logger.error('Failed to save Phase 1 checkpoint');
        process.exit(1);
      }

      logger.info('=== PHASE 1 COMPLETE ===');
    } else {
      logger.info('=== PHASE 1: SKIPPED (checkpoint exists) ===');
    }

    // ========================================
    // PHASE 2: PROCESSING
    // ========================================
    if (shouldRunPhase2 || shouldRunPhase1) {
      logger.info('=== PHASE 2: PROCESSING ===');

      // Parse LinkedIn HTML
      const linkedinRawPath = path.join(__dirname, 'data', 'raw', 'linkedin_raw.html');
      logger.info('Parsing LinkedIn HTML', { path: linkedinRawPath });

      try {
        const linkedinParsed = await parseLinkedInHTML(linkedinRawPath);
        const linkedinOutputPath = path.join(
          __dirname,
          'data',
          'processed',
          'linkedin_mined.json'
        );
        saveJSON(linkedinOutputPath, linkedinParsed);
        logger.info('LinkedIn parsing completed', {
          output: linkedinOutputPath,
          experience_count: linkedinParsed.experience.length,
          skills_count: linkedinParsed.skills.length,
        });
      } catch (error) {
        logger.error('LinkedIn parsing failed', {
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }

      // Analyze GitHub data (DNA analysis)
      const githubRawPath = path.join(__dirname, 'data', 'raw', 'github_raw.json');
      logger.info('Analyzing GitHub data', { path: githubRawPath });

      try {
        const techDna = analyze(githubRawPath);
        if (!techDna) {
          logger.error('GitHub DNA analysis returned null');
          throw new Error('GitHub DNA analysis failed');
        }
        logger.info('GitHub DNA analysis completed', {
          tech_count: techDna.technologies.length,
        });
      } catch (error) {
        logger.error('GitHub DNA analysis failed', {
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }

      // Save Phase 2 checkpoint
      const phase2Success = saveCheckpoint('phase_2', {
        type: 'processing_complete',
      });

      if (!phase2Success) {
        logger.error('Failed to save Phase 2 checkpoint');
        process.exit(1);
      }

      logger.info('=== PHASE 2 COMPLETE ===');
    } else {
      logger.info('=== PHASE 2: SKIPPED (checkpoint exists) ===');
    }

    // ========================================
    // PHASE 3: AGGREGATION
    // ========================================
    if (shouldRunPhase3 || shouldRunPhase1 || shouldRunPhase2) {
      logger.info('=== PHASE 3: AGGREGATION ===');

      // Parse job description
      const jobFilePath = path.join(__dirname, 'vaga.txt');
      logger.info('Parsing job description', { path: jobFilePath });

      try {
        const jobParsed = parseJob(jobFilePath);
        const jobOutputPath = path.join(__dirname, 'data', 'processed', 'job_parsed.json');
        saveJSON(jobOutputPath, jobParsed);
        logger.info('Job parsing completed', {
          output: jobOutputPath,
          title: jobParsed.title,
          required_skills: jobParsed.required_skills.length,
        });
      } catch (error) {
        logger.error('Job parsing failed', {
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }

      // Aggregate all data into master context
      logger.info('Starting master context aggregation');

      try {
        const masterContext = aggregate();
        if (!masterContext) {
          logger.error('Master context aggregation returned null');
          throw new Error('Master context aggregation failed');
        }
        logger.info('Master context aggregation completed', {
          github_techs: masterContext.github.tech_dna.length,
          linkedin_skills: masterContext.linkedin.skills.length,
          job_title: masterContext.job.title,
        });
      } catch (error) {
        logger.error('Master context aggregation failed', {
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }

      // Save Phase 3 checkpoint
      const phase3Success = saveCheckpoint('phase_3', {
        type: 'aggregation_complete',
      });

      if (!phase3Success) {
        logger.error('Failed to save Phase 3 checkpoint');
        process.exit(1);
      }

      logger.info('=== PHASE 3 COMPLETE ===');
    } else {
      logger.info('=== PHASE 3: SKIPPED (checkpoint exists) ===');
    }

    // ========================================
    // PIPELINE COMPLETE
    // ========================================
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info('=== PIPELINE COMPLETE ===', { duration_seconds: duration });

    const masterContextPath = path.join(__dirname, 'data', 'processed', 'master_context.json');
    console.log('\n=== PIPELINE COMPLETE ===');
    console.log(`Master context ready for AI CV synthesis: ${masterContextPath}`);
    console.log(`Total duration: ${duration}s`);

    process.exit(0);
  } catch (error) {
    logger.error('PIPELINE FAILED', {
      error: error.message,
      stack: error.stack,
    });
    console.error('\n=== PIPELINE FAILED ===');
    console.error(`Error: ${error.message}`);
    console.error(`Stack trace:\n${error.stack}`);
    process.exit(1);
  }
}

// Run main pipeline
main();

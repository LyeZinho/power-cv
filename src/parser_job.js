import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from './logger.js';
import { saveJSON, readFileText } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Skill keywords database
const SKILL_KEYWORDS = {
  frontend: ['react', 'vue', 'angular', 'svelte'],
  backend: ['node.js', 'node', 'express', 'nestjs', 'django', 'flask'],
  database: ['postgresql', 'postgres', 'mongodb', 'mysql', 'redis', 'cassandra'],
  devops: ['aws', 'gcp', 'azure', 'docker', 'kubernetes'],
  languages: ['javascript', 'typescript', 'python', 'go', 'rust', 'java'],
  concepts: ['graphql', 'rest', 'microservices', 'solid', 'tdd']
};

// Flatten skill keywords for easy lookup
const ALL_SKILLS = Object.values(SKILL_KEYWORDS).flat();

// Keywords heuristics
const KEYWORD_PATTERNS = [
  'distributed',
  'scalable',
  'microservice',
  'cloud',
  'security',
  'performance',
  'optimize',
  'optimization',
  'high-availability',
  'load-balancing'
];

/**
 * Extract title from job description
 * Strategy: Use first heading (# or ##) or first substantial line
 */
const extractTitle = (content) => {
  const lines = content.split('\n');
  
  // Look for markdown heading
  for (const line of lines) {
    if (line.match(/^#+\s+(.+)$/)) {
      const match = line.match(/^#+\s+(.+)$/);
      if (match) return match[1].trim();
    }
  }
  
  // Fall back to first non-empty line
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('-') && !trimmed.startsWith('*')) {
      return trimmed;
    }
  }
  
  return 'Job Title Not Found';
};

/**
 * Extract skills from content with categorization
 * Required: appears in "must have", "required", "must know" sections
 * Nice-to-have: appears in "nice to have", "optional", "preferred" sections
 */
const extractSkills = (content) => {
  const required_skills = new Set();
  const nice_to_have = new Set();
  
  // Convert content to lowercase for matching
  const lowerContent = content.toLowerCase();
  
  // Split into sections to identify context
  const requiredMatch = lowerContent.match(/(?:must have|required|must know)[^]*?(?=(?:nice to have|optional|preferred|additional|keywords|$))/gi);
  const niceToHaveMatch = lowerContent.match(/(?:nice to have|optional|preferred)[^]*?(?=(?:must have|required|must know|additional|keywords|$))/gi);
  const otherMatch = lowerContent.match(/(?:additional|experience|about)[^]*?(?=(?:nice to have|optional|preferred|keywords|$))/gi);
  
  // Extract skills from required section
  if (requiredMatch) {
    const requiredText = requiredMatch.join(' ');
    ALL_SKILLS.forEach(skill => {
      if (requiredText.includes(skill.toLowerCase())) {
        required_skills.add(skill);
      }
    });
  }
  
  // Extract skills from nice-to-have section
  if (niceToHaveMatch) {
    const niceText = niceToHaveMatch.join(' ');
    ALL_SKILLS.forEach(skill => {
      if (niceText.includes(skill.toLowerCase())) {
        nice_to_have.add(skill);
      }
    });
  }
  
  // Extract skills from other sections (treat as required)
  if (otherMatch) {
    const otherText = otherMatch.join(' ');
    ALL_SKILLS.forEach(skill => {
      if (otherText.includes(skill.toLowerCase()) && !nice_to_have.has(skill)) {
        required_skills.add(skill);
      }
    });
  }
  
  // If a skill appears in both, keep only in required
  nice_to_have.forEach(skill => {
    if (required_skills.has(skill)) {
      nice_to_have.delete(skill);
    }
  });
  
  return {
    required_skills: Array.from(required_skills),
    nice_to_have: Array.from(nice_to_have)
  };
};

/**
 * Extract years of experience and determine seniority level
 */
const extractExperience = (content) => {
  let years_experience = null;
  let seniority_level = 'mid';
  
  const lowerContent = content.toLowerCase();
  
  // Try to extract years using regex (matches "5+ years", "5 years", etc.)
  // Look for highest match first (prioritize larger numbers)
  const allMatches = [...lowerContent.matchAll(/(\d+)\+?\s+(?:years?|yrs?)\s+(?:of\s+)?(?:software\s+)?(?:development\s+)?experience/gi)];
  if (allMatches.length > 0) {
    const nums = allMatches.map(m => parseInt(m[1], 10)).sort((a, b) => b - a);
    years_experience = nums[0];
  }
  
  // Explicit seniority labels
  if (lowerContent.includes('senior')) {
    seniority_level = 'senior';
  } else if (lowerContent.includes('mid-level') || lowerContent.includes('mid level')) {
    seniority_level = 'mid';
  } else if (lowerContent.includes('junior')) {
    seniority_level = 'junior';
  }
  
  // If we have years but no explicit label, calculate based on years
  if (years_experience !== null && !lowerContent.match(/(?:senior|mid-level|mid level|junior)/i)) {
    if (years_experience >= 5) {
      seniority_level = 'senior';
    } else if (years_experience >= 3) {
      seniority_level = 'mid';
    } else {
      seniority_level = 'junior';
    }
  }
  
  return {
    years_experience,
    seniority_level
  };
};

/**
 * Extract keywords using heuristic patterns
 */
const extractKeywords = (content) => {
  const lowerContent = content.toLowerCase();
  const keywords = new Set();
  
  KEYWORD_PATTERNS.forEach(pattern => {
    if (lowerContent.includes(pattern.toLowerCase())) {
      keywords.add(pattern);
    }
  });
  
  return Array.from(keywords);
};

/**
 * Main parser function
 */
export const parseJob = (jobFilePath) => {
  logger.info(`Starting job parsing from: ${jobFilePath}`);
  
  const content = readFileText(jobFilePath);
  
  if (!content) {
    logger.warn(`Job file not found: ${jobFilePath}, returning empty structure`);
    return {
      title: null,
      required_skills: [],
      nice_to_have: [],
      years_experience: null,
      seniority_level: null,
      tech_stack: [],
      keywords: [],
      extracted_at: new Date().toISOString()
    };
  }
  
  try {
    // Extract all components
    const title = extractTitle(content);
    const { required_skills, nice_to_have } = extractSkills(content);
    const { years_experience, seniority_level } = extractExperience(content);
    const keywords = extractKeywords(content);
    
    // Tech stack is same as required skills
    const tech_stack = required_skills;
    
    const result = {
      title,
      required_skills,
      nice_to_have,
      years_experience,
      seniority_level,
      tech_stack,
      keywords,
      extracted_at: new Date().toISOString()
    };
    
    logger.info(`Job parsing completed successfully`, {
      title,
      skill_count: required_skills.length,
      seniority: seniority_level,
      keywords_count: keywords.length
    });
    
    return result;
  } catch (error) {
    logger.error(`Error parsing job file: ${error.message}`, { filePath: jobFilePath });
    return {
      title: null,
      required_skills: [],
      nice_to_have: [],
      years_experience: null,
      seniority_level: null,
      tech_stack: [],
      keywords: [],
      extracted_at: new Date().toISOString(),
      error: error.message
    };
  }
};

/**
 * Parse job and save to JSON file
 */
export const parseAndSaveJob = (inputPath, outputPath) => {
  const parsed = parseJob(inputPath);
  saveJSON(outputPath, parsed);
  logger.info(`Job data saved to: ${outputPath}`);
  return parsed;
};

// Default export
export default { parseJob, parseAndSaveJob };

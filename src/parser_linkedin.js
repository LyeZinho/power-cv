import fs from 'fs';
import path from 'path';
import cheerio from 'cheerio';
import logger from './logger.js';
import { saveJSON, readFileText, ensureDir } from './utils.js';

/**
 * Parse LinkedIn HTML and extract structured data
 * @param {string} htmlFilePath - Path to raw LinkedIn HTML file
 * @returns {Promise<Object>} Structured LinkedIn profile data
 */
export const parseLinkedInHTML = async (htmlFilePath) => {
  try {
    logger.info('Starting LinkedIn HTML parsing', { filePath: htmlFilePath });

    // Check if file exists
    if (!fs.existsSync(htmlFilePath)) {
      logger.error('HTML file not found', { filePath: htmlFilePath });
      throw new Error(`HTML file not found: ${htmlFilePath}`);
    }

    // Read HTML file
    const htmlContent = readFileText(htmlFilePath);
    if (!htmlContent) {
      logger.error('Failed to read HTML file', { filePath: htmlFilePath });
      throw new Error(`Failed to read HTML file: ${htmlFilePath}`);
    }

    // Load HTML with Cheerio
    const $ = cheerio.load(htmlContent);

    // Extract all sections
    const bio = extractBio($);
    const experience = extractExperience($);
    const skills = extractSkills($);
    const education = extractEducation($);
    const activity = extractActivity($);

    const result = {
      bio,
      experience,
      skills,
      education,
      activity,
      parsed_at: new Date().toISOString(),
    };

    logger.info('LinkedIn HTML parsing completed', {
      bio_length: bio.length,
      experience_count: experience.length,
      skills_count: skills.length,
      education_count: education.length,
      activity_posts: activity.posts_count,
    });

    return result;
  } catch (error) {
    logger.error('Error parsing LinkedIn HTML', { error: error.message });
    throw error;
  }
};

/**
 * Extract bio/headline from profile
 */
const extractBio = ($) => {
  try {
    // Try multiple selectors for bio
    let bio =
      $('h2[data-test-id="top-card-headline"]').text().trim() ||
      $('h2').first().text().trim() ||
      $('[data-section="summary"] p').first().text().trim() ||
      $('.summary').text().trim() ||
      $('*[data-test-id*="headline"]').text().trim() ||
      '';

    logger.debug('Bio extracted', { length: bio.length });
    return bio;
  } catch (error) {
    logger.warn('Error extracting bio', { error: error.message });
    return '';
  }
};

/**
 * Extract experience entries
 */
const extractExperience = ($) => {
  const experiences = [];

  try {
    // Try to find experience section
    const expSelectors = [
      '[data-section="experience"]',
      '[data-test-id*="experience"]',
      '.experience',
      '[role="main"] section',
    ];

    let $expSection = null;

    for (const selector of expSelectors) {
      $expSection = $(selector);
      if ($expSection.length > 0) {
        break;
      }
    }

    // If section found, iterate through experience entries
    if ($expSection && $expSection.length > 0) {
      $expSection.each((sectionIdx, sectionEl) => {
        const $entries = $(sectionEl).find('li, [data-test-id*="experience-item"], .experience-item');

        $entries.each((idx, el) => {
          const $entry = $(el);

          // Extract title
          const title =
            $entry.find('h3[data-test-id*="title"], .title, h3').first().text().trim() ||
            $entry.find('[data-test-id*="title"]').first().text().trim() ||
            '';

          // Extract company
          const company =
            $entry.find('h4[data-test-id*="company"], .company, h4').first().text().trim() ||
            $entry.find('[data-test-id*="company"]').first().text().trim() ||
            $entry.find('a').first().text().trim() ||
            '';

          // Extract period/dates
          const period =
            $entry.find('[data-test-id*="duration"], .duration, .date').text().trim() ||
            $entry.find('span:contains("–"), span:contains("-")').text().trim() ||
            '';

          // Extract description
          const description =
            $entry.find('p, [data-test-id*="description"]').first().text().trim() ||
            '';

          // Extract location
          const location =
            $entry.find('[data-test-id*="location"], .location').text().trim() ||
            '';

          // Extract skills mentioned in experience
          const skills_mentioned = $entry
            .find('span[data-test-id*="skill"], .skill, .tag')
            .map((_, el) => $(el).text().trim())
            .get();

          if (title || company) {
            experiences.push({
              title,
              company,
              period,
              description,
              location,
              skills_mentioned,
            });
          }
        });
      });
    }

    logger.debug('Experience entries extracted', { count: experiences.length });
  } catch (error) {
    logger.warn('Error extracting experience', { error: error.message });
  }

  return experiences;
};

/**
 * Extract skills
 */
const extractSkills = ($) => {
  const skills = [];

  try {
    // Try multiple selectors for skills section
    const skillSelectors = [
      '[data-section="skills"] li',
      '[data-test-id*="skill"] li',
      '.skills li',
      '.skill',
      '[data-test-id*="endorsement-item"]',
    ];

    for (const selector of skillSelectors) {
      const $skills = $(selector);

      $skills.each((idx, el) => {
        const $skill = $(el);

        // Extract skill text
        let skillText =
          $skill.find('span').first().text().trim() ||
          $skill.find('h3, .skill-name, [data-test-id*="skill"]').first().text().trim() ||
          $skill.text().trim();

        // Clean up the text
        skillText = skillText
          .replace(/\s+/g, ' ')
          .replace(/^\d+\s/, '') // Remove leading numbers
          .trim();

        if (skillText && skillText.length > 0 && !skills.includes(skillText)) {
          skills.push(skillText);
        }
      });

      if (skills.length > 0) break; // Use first selector that returns results
    }

    logger.debug('Skills extracted', { count: skills.length });
  } catch (error) {
    logger.warn('Error extracting skills', { error: error.message });
  }

  return skills;
};

/**
 * Extract education entries
 */
const extractEducation = ($) => {
  const education = [];

  try {
    // Try to find education section
    const eduSelectors = [
      '[data-section="education"] li',
      '[data-test-id*="education"] li',
      '.education li',
      '.education-item',
    ];

    for (const selector of eduSelectors) {
      const $eduEntries = $(selector);

      $eduEntries.each((idx, el) => {
        const $entry = $(el);

        // Extract school
        const school =
          $entry.find('h3[data-test-id*="school"], .school, h3').first().text().trim() ||
          $entry.find('[data-test-id*="school"]').first().text().trim() ||
          '';

        // Extract degree
        const degree =
          $entry.find('[data-test-id*="degree"], .degree').text().trim() ||
          $entry.find('span:contains("Bachelor"), span:contains("Master"), span:contains("Associate")').first().text().trim() ||
          '';

        // Extract field of study
        const field =
          $entry.find('[data-test-id*="field"], .field, .major').text().trim() ||
          $entry.find('span').eq(1).text().trim() ||
          '';

        // Extract graduation date
        const graduated =
          $entry.find('[data-test-id*="date"], .date, .graduation').text().trim() ||
          '';

        if (school) {
          education.push({
            school,
            degree,
            field,
            graduated,
          });
        }
      });

      if (education.length > 0) break; // Use first selector that returns results
    }

    logger.debug('Education entries extracted', { count: education.length });
  } catch (error) {
    logger.warn('Error extracting education', { error: error.message });
  }

  return education;
};

/**
 * Extract activity/engagement metrics
 */
const extractActivity = ($) => {
  let posts_count = 0;
  let engagement_score = 0;

  try {
    // Count activity posts
    const postSelectors = [
      '[data-test-id*="activity"]',
      '.activity-item',
      '.post',
      '[data-test-id*="feed-item"]',
    ];

    for (const selector of postSelectors) {
      const count = $(selector).length;
      if (count > 0) {
        posts_count = count;
        break;
      }
    }

    // Calculate basic engagement score from likes, comments, reactions
    const likes = $('[data-test-id*="like"], .like-count, [aria-label*="like"]').length;
    const comments = $('[data-test-id*="comment"], .comment-count, [aria-label*="comment"]').length;
    const reactions = $('[data-test-id*="reaction"], .reaction, [aria-label*="react"]').length;

    engagement_score = likes * 1 + comments * 2 + reactions * 1;

    logger.debug('Activity extracted', { posts_count, engagement_score });
  } catch (error) {
    logger.warn('Error extracting activity', { error: error.message });
  }

  return {
    posts_count,
    engagement_score,
  };
};

/**
 * Main parser function that reads, parses, and saves
 */
export const parseAndSaveLinkedInHTML = async (htmlFilePath, outputFilePath) => {
  try {
    const parsed = await parseLinkedInHTML(htmlFilePath);

    // Ensure output directory exists
    ensureDir(path.dirname(outputFilePath));

    // Save to JSON file
    saveJSON(outputFilePath, parsed);

    logger.info('LinkedIn data saved', {
      outputPath: outputFilePath,
      entries: {
        experience: parsed.experience.length,
        skills: parsed.skills.length,
        education: parsed.education.length,
      },
    });

    return parsed;
  } catch (error) {
    logger.error('Error in parseAndSaveLinkedInHTML', { error: error.message });
    throw error;
  }
};

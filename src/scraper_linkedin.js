import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from './logger.js';
import { ensureDir, saveJSON, sleep } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Scrapes a LinkedIn profile using persistent browser context
 * @param {string} linkedinUsername - LinkedIn username (without full URL)
 * @returns {Promise<Object|null>} Scraped data or null if login required
 */
export async function scrape(linkedinUsername) {
  const profileUrl = `https://www.linkedin.com/in/${linkedinUsername}`;
  logger.info('Starting LinkedIn scrape', { username: linkedinUsername, url: profileUrl });

  const userDataDir = path.join(__dirname, '..', 'user_data', 'linkedin');
  const rawDataDir = path.join(__dirname, '..', 'data', 'raw');
  
  ensureDir(userDataDir);
  ensureDir(rawDataDir);

  let context = null;
  let page = null;

  try {
    // Launch persistent context (assumes already logged in)
    logger.info('Launching persistent browser context', { userDataDir });
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { width: 1280, height: 720 },
      args: ['--disable-blink-features=AutomationControlled']
    });

    page = context.pages()[0] || await context.newPage();

    // Navigate to profile
    logger.info('Navigating to profile', { url: profileUrl });
    await page.goto(profileUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Validate login status (check for profile card)
    logger.info('Validating login status');
    const isLoggedIn = await page.locator('[data-test-id="profile-card"]')
      .first()
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (!isLoggedIn) {
      logger.error('Not logged in to LinkedIn. Please log in manually first.');
      return null;
    }

    logger.info('Login validated successfully');

    // Expand all "See more" buttons
    logger.info('Expanding "See more" sections');
    const seeMoreSelectors = [
      'button[aria-label*="Show more"]',
      'button[aria-label*="See more"]',
      'button.inline-show-more-text__button',
      '.pv-profile-section__see-more-inline',
      '.lt-line-clamp__more'
    ];

    for (const selector of seeMoreSelectors) {
      try {
        const buttons = await page.locator(selector).all();
        logger.info(`Found ${buttons.length} "${selector}" buttons`);
        
        for (const button of buttons) {
          try {
            if (await button.isVisible()) {
              await button.click();
              await sleep(500); // Wait between clicks
            }
          } catch (err) {
            // Button might disappear after click or be stale, continue
            logger.debug(`Could not click button: ${err.message}`);
          }
        }
      } catch (err) {
        logger.debug(`No buttons found for selector "${selector}"`);
      }
    }

    logger.info('Expanded all "See more" sections');

    // Scroll through activity feed to load lazy content
    logger.info('Scrolling through activity feed');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await sleep(1000); // Wait for content to load
      logger.debug(`Scroll iteration ${i + 1}/5`);
    }

    logger.info('Completed scrolling');

    // Save raw HTML
    const rawHtmlPath = path.join(rawDataDir, 'linkedin_raw.html');
    const htmlContent = await page.content();
    fs.writeFileSync(rawHtmlPath, htmlContent, 'utf8');
    logger.info('Saved raw HTML', { path: rawHtmlPath, size: htmlContent.length });

    // Extract basic data
    logger.info('Extracting profile data');
    
    const headline = await page.locator('h1').first().textContent()
      .catch(() => '');
    
    const bio = await page.locator('[data-test-id="top-card-headline"]').first().textContent()
      .catch(() => '');

    const data = {
      profile_url: profileUrl,
      headline: headline.trim(),
      bio: bio.trim(),
      scraped_at: new Date().toISOString()
    };

    // Save extracted data
    const dataJsonPath = path.join(rawDataDir, 'linkedin_data.json');
    saveJSON(dataJsonPath, data);
    logger.info('Saved extracted data', { path: dataJsonPath, data });

    logger.info('LinkedIn scrape completed successfully');
    return data;

  } catch (error) {
    logger.error('LinkedIn scrape failed', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    if (context) {
      await context.close();
      logger.info('Browser context closed');
    }
  }
}

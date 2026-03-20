import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from './logger.js';
import { ensureDir, saveJSON, sleep } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let _persistentContext = null;

async function getOrCreateContext() {
  const userDataDir = path.join(__dirname, '..', 'user_data', 'linkedin');
  ensureDir(userDataDir);

  if (_persistentContext) {
    try {
      _persistentContext.pages();
      logger.info('Reusing existing persistent browser context');
      return _persistentContext;
    } catch {
      logger.info('Previous browser context was closed, creating new one');
      _persistentContext = null;
    }
  }

  logger.info('Launching persistent browser context', { userDataDir });
  _persistentContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  return _persistentContext;
}

async function isLoggedIn(page) {
  const loggedInSelectors = [
    '.pv-top-card',
    '.scaffold-layout__main',
    '[data-test-id="profile-card"]',
    '.profile-photo-edit',
    'section.artdeco-card',
    '.global-nav__me-photo',
    '#global-nav',
  ];

  for (const selector of loggedInSelectors) {
    try {
      const element = await page.locator(selector).first();
      if (await element.isVisible({ timeout: 500 })) {
        return true;
      }
    } catch {
    }
  }

  return false;
}

async function waitForManualLogin(page, maxWaitMs = 300000) {
  const pollIntervalMs = 2000;
  const maxAttempts = Math.floor(maxWaitMs / pollIntervalMs);

  console.log('\n' + '='.repeat(60));
  console.log('  LINKEDIN LOGIN REQUIRED');
  console.log('='.repeat(60));
  console.log('  A browser window has opened with LinkedIn.');
  console.log('  Please log in manually in that browser window.');
  console.log('  The script will detect your login and continue automatically.');
  console.log(`  Timeout: ${maxWaitMs / 1000 / 60} minutes`);
  console.log('='.repeat(60) + '\n');

  logger.info('Waiting for manual LinkedIn login', { maxWaitMs, pollIntervalMs });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await isLoggedIn(page)) {
      console.log('\n✓ Login detected! Continuing with scraping...\n');
      logger.info('Login detected after polling', { attempts: attempt + 1 });
      return true;
    }

    if (attempt > 0 && attempt % 10 === 0) {
      const elapsed = (attempt * pollIntervalMs) / 1000;
      const remaining = (maxWaitMs / 1000) - elapsed;
      console.log(`  Still waiting for login... (${remaining}s remaining)`);
    }

    await sleep(pollIntervalMs);
  }

  logger.error('Login wait timed out', { maxWaitMs });
  console.log('\n✗ Login timeout! Please run the script again.\n');
  return false;
}

/**
 * @param {string} linkedinUsername - LinkedIn username (without full URL)
 * @returns {Promise<Object|null>} Scraped data or null if login failed
 */
export async function scrape(linkedinUsername) {
  const profileUrl = `https://www.linkedin.com/in/${linkedinUsername}`;
  logger.info('Starting LinkedIn scrape', { username: linkedinUsername, url: profileUrl });

  const rawDataDir = path.join(__dirname, '..', 'data', 'raw');
  ensureDir(rawDataDir);

  let context = null;
  let page = null;

  try {
    context = await getOrCreateContext();
    page = context.pages()[0] || await context.newPage();

    logger.info('Navigating to profile', { url: profileUrl });
    await page.goto(profileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await sleep(2000);

    logger.info('Checking login status');
    let loggedIn = await isLoggedIn(page);

    if (!loggedIn) {
      loggedIn = await waitForManualLogin(page, 300000);

      if (!loggedIn) {
        logger.error('Login was not completed in time');
        return null;
      }

      logger.info('Re-navigating to profile after login', { url: profileUrl });
      await page.goto(profileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await sleep(2000);
    }

    logger.info('Login validated successfully');

    logger.info('Expanding "See more" sections');
    const seeMoreSelectors = [
      'button[aria-label*="Show more"]',
      'button[aria-label*="See more"]',
      'button.inline-show-more-text__button',
      '.pv-profile-section__see-more-inline',
      '.lt-line-clamp__more',
    ];

    for (const selector of seeMoreSelectors) {
      try {
        const buttons = await page.locator(selector).all();
        logger.info(`Found ${buttons.length} "${selector}" buttons`);

        for (const button of buttons) {
          try {
            if (await button.isVisible()) {
              await button.click();
              await sleep(500);
            }
          } catch (err) {
            logger.debug(`Could not click button: ${err.message}`);
          }
        }
      } catch (err) {
        logger.debug(`No buttons found for selector "${selector}"`);
      }
    }

    logger.info('Expanded all "See more" sections');

    logger.info('Scrolling through activity feed');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await sleep(1000);
      logger.debug(`Scroll iteration ${i + 1}/5`);
    }

    logger.info('Completed scrolling');

    const rawHtmlPath = path.join(rawDataDir, 'linkedin_raw.html');
    const htmlContent = await page.content();
    fs.writeFileSync(rawHtmlPath, htmlContent, 'utf8');
    logger.info('Saved raw HTML', { path: rawHtmlPath, size: htmlContent.length });

    logger.info('Extracting profile data');

    const headline = await page.locator('h1').first().textContent()
      .catch(() => '');

    const bio = await page.locator('[data-test-id="top-card-headline"]').first().textContent()
      .catch(() => '');

    const data = {
      profile_url: profileUrl,
      headline: headline.trim(),
      bio: bio.trim(),
      scraped_at: new Date().toISOString(),
    };

    const dataJsonPath = path.join(rawDataDir, 'linkedin_data.json');
    saveJSON(dataJsonPath, data);
    logger.info('Saved extracted data', { path: dataJsonPath, data });

    logger.info('LinkedIn scrape completed successfully');

    return data;

  } catch (error) {
    logger.error('LinkedIn scrape failed', { error: error.message, stack: error.stack });
    throw error;
  }
}

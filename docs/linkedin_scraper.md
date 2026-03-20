# LinkedIn Profile Scraper

Scrapes LinkedIn profiles using Playwright persistent context (requires manual login).

## Setup

1. Install Playwright browsers:
```bash
npx playwright install chromium
```

2. Directory structure created automatically:
- `user_data/linkedin/` - Persistent browser profile (stores login session)
- `data/raw/` - Output directory for scraped data

## Usage

```javascript
import { scrape } from './src/scraper_linkedin.js';

const data = await scrape('williamhgates');

if (data === null) {
  console.log('Not logged in - browser will open for manual login');
} else {
  console.log('Scraped:', data.profile_url);
}
```

## First Run

On first run, the browser opens in visible mode. Log in to LinkedIn manually - the session persists in `user_data/linkedin/` for future runs.

## Output Files

- `data/raw/linkedin_raw.html` - Complete page HTML after expansion
- `data/raw/linkedin_data.json` - Extracted structured data

## Features

- Persistent browser context (stays logged in)
- Expands all "See more" sections automatically
- Scrolls activity feed to load lazy content
- Validates login status before scraping
- Graceful error handling and logging
- Anti-bot detection bypass

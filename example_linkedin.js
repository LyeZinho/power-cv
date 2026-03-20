import { scrape } from './src/scraper_linkedin.js';

const TARGET_LINKEDIN_USERNAME = 'williamhgates';

try {
  const data = await scrape(TARGET_LINKEDIN_USERNAME);
  
  if (data === null) {
    console.log('❌ Not logged in. Please log in to LinkedIn manually in the browser window.');
  } else {
    console.log('✅ Scrape successful!');
    console.log('Profile URL:', data.profile_url);
    console.log('Headline:', data.headline);
    console.log('Bio:', data.bio);
    console.log('Scraped at:', data.scraped_at);
    console.log('\nRaw HTML saved to: data/raw/linkedin_raw.html');
    console.log('Data saved to: data/raw/linkedin_data.json');
  }
} catch (error) {
  console.error('❌ Scrape failed:', error.message);
}

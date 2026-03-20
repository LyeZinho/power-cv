import { parseAndSaveLinkedInHTML } from './src/parser_linkedin.js';
import logger from './src/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const htmlInputPath = path.join(__dirname, 'data', 'raw', 'linkedin_raw.html');
const jsonOutputPath = path.join(__dirname, 'data', 'processed', 'linkedin_mined.json');

try {
  logger.info('Starting LinkedIn HTML parser');
  
  const result = await parseAndSaveLinkedInHTML(htmlInputPath, jsonOutputPath);
  
  console.log('\n✅ Parsing Complete!');
  console.log(`📊 Summary:`);
  console.log(`  - Bio: ${result.bio.substring(0, 50)}${result.bio.length > 50 ? '...' : ''}`);
  console.log(`  - Experience entries: ${result.experience.length}`);
  console.log(`  - Skills: ${result.skills.length}`);
  console.log(`  - Education entries: ${result.education.length}`);
  console.log(`  - Activity posts: ${result.activity.posts_count}`);
  console.log(`  - Engagement score: ${result.activity.engagement_score}`);
  console.log(`\n💾 Output saved to: ${jsonOutputPath}`);
  
} catch (error) {
  console.error('❌ Parsing failed:', error.message);
  logger.error('Parser failed', { error: error.message });
}

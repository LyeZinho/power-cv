# LinkedIn HTML Parser

Extracts structured data from scraped LinkedIn HTML using Cheerio for safe, fast parsing.

## Features

- **Graceful Error Handling**: Returns empty arrays/strings for missing elements instead of failing
- **Multi-Selector Fallback**: Uses multiple CSS selector strategies for robustness against HTML structure variations
- **Structured JSON Output**: Organized data with timestamps
- **Comprehensive Logging**: All operations logged to daily log files
- **Activity Metrics**: Extracts post count and engagement score

## API

### parseLinkedInHTML(htmlFilePath)

Parses LinkedIn HTML and extracts structured profile data.

**Parameters:**
- `htmlFilePath` (string): Path to raw LinkedIn HTML file

**Returns:** Promise<Object>
```javascript
{
  bio: string,
  experience: Array<{
    title: string,
    company: string,
    period: string,
    description: string,
    location: string,
    skills_mentioned: string[]
  }>,
  skills: string[],
  education: Array<{
    school: string,
    degree: string,
    field: string,
    graduated: string
  }>,
  activity: {
    posts_count: number,
    engagement_score: number
  },
  parsed_at: string (ISO8601)
}
```

### parseAndSaveLinkedInHTML(htmlFilePath, outputFilePath)

Parses HTML and automatically saves result to JSON file.

**Parameters:**
- `htmlFilePath` (string): Path to raw HTML file
- `outputFilePath` (string): Path for output JSON file

**Returns:** Promise<Object> (same structure as parseLinkedInHTML)

## Usage

```javascript
import { parseAndSaveLinkedInHTML } from './src/parser_linkedin.js';

const result = await parseAndSaveLinkedInHTML(
  'data/raw/linkedin_raw.html',
  'data/processed/linkedin_mined.json'
);

console.log(`Extracted ${result.skills.length} skills`);
console.log(`${result.experience.length} experience entries`);
```

## Data Extraction Strategy

### Selectors Priority Order

1. **data-test-id attributes** (LinkedIn's primary selectors)
2. **Class names** (common patterns like .company, .title)
3. **Tag names** (h3, h4, p as fallbacks)
4. **Custom data attributes** (data-section, data-* patterns)

### Bio/Headline
- Primary: `h2[data-test-id="top-card-headline"]`
- Fallback: `h2`, `.summary`, generic headline elements

### Experience
- Container: `[data-section="experience"]`, `.experience`, `[role="main"] section`
- Per entry: `li` elements within container
- Fields: `h3` (title), `h4` (company), `div[data-test-id="duration"]`, `p` (description)

### Skills
- Container: `[data-section="skills"]`
- Items: `li` or individual `.skill` elements
- Cleans: removes leading numbers, normalizes whitespace

### Education
- Container: `[data-section="education"]`
- Per entry: `li` elements
- Fields: `h3` (school), `span` (degree, field, date)

### Activity
- Items: `[data-test-id*="activity"]`, `.activity-item`, `.post`
- Engagement: counts like/comment buttons as proxies for engagement

## Error Handling

- Missing HTML file: Throws with descriptive error
- Missing elements: Returns empty string or empty array
- Parse errors: Logged as warnings, graceful degradation
- All errors logged to `data/logs/{date}.log`

## Example

```javascript
// Run the example parser
node example_parser.js

// Output
✅ Parsing Complete!
📊 Summary:
  - Bio: Software Engineer | Full Stack Developer...
  - Experience entries: 2
  - Skills: 10
  - Education entries: 2
  - Activity posts: 3
  - Engagement score: 9

💾 Output saved to: data/processed/linkedin_mined.json
```

## Dependencies

- **cheerio** (1.0.0-rc.12): jQuery-like syntax for Node.js HTML parsing
- **logger**: Custom logging module (data/logs/{date}.log)
- **utils**: File operations (ensureDir, saveJSON, readFileText)

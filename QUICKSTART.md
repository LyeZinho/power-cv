# Quick Start - LinkedIn Parser

## Installation
Already installed! Uses existing dependencies:
- `cheerio`: ^1.0.0-rc.12
- Node.js ES modules (ES6 imports)

## Basic Usage

```javascript
import { parseAndSaveLinkedInHTML } from './src/parser_linkedin.js';

// Parse LinkedIn HTML and save to JSON
const result = await parseAndSaveLinkedInHTML(
  'data/raw/linkedin_raw.html',
  'data/processed/linkedin_mined.json'
);

console.log(`Extracted ${result.skills.length} skills`);
console.log(`${result.experience.length} experience entries`);
```

## API Reference

### parseLinkedInHTML(htmlFilePath)
Parse raw LinkedIn HTML without saving.

```javascript
const result = await parseLinkedInHTML('path/to/html.html');
// Returns: { bio, experience[], skills[], education[], activity{}, parsed_at }
```

### parseAndSaveLinkedInHTML(htmlFilePath, outputFilePath)
Parse HTML and automatically save to JSON file.

```javascript
const result = await parseAndSaveLinkedInHTML(
  'data/raw/linkedin_raw.html',
  'data/processed/linkedin_mined.json'
);
// Creates output directory if needed
// Returns: parsed data object
```

## Output Format

```json
{
  "bio": "string",
  "experience": [
    {
      "title": "string",
      "company": "string",
      "period": "string",
      "description": "string",
      "location": "string",
      "skills_mentioned": ["string"]
    }
  ],
  "skills": ["string"],
  "education": [
    {
      "school": "string",
      "degree": "string",
      "field": "string",
      "graduated": "string"
    }
  ],
  "activity": {
    "posts_count": number,
    "engagement_score": number
  },
  "parsed_at": "ISO8601 timestamp"
}
```

## Run the Example

```bash
node example_parser.js
```

Output:
```
✅ Parsing Complete!
📊 Summary:
  - Bio: Software Engineer | Full Stack Developer | Open to...
  - Experience entries: 2
  - Skills: 10
  - Education entries: 2
  - Activity posts: 3
  - Engagement score: 9

💾 Output saved to: data/processed/linkedin_mined.json
```

## Features

✅ **Robust HTML Parsing**
- Uses Cheerio for safe, fast parsing
- Multi-selector fallback strategy
- Handles missing elements gracefully

✅ **Comprehensive Data Extraction**
- Bio/headline
- Experience (title, company, period, description, location, skills)
- Skills (deduplicated, cleaned)
- Education (school, degree, field, graduation date)
- Activity metrics (post count, engagement score)

✅ **Error Handling**
- File existence validation
- Graceful degradation (empty values instead of crashes)
- Try-catch blocks around all extraction functions
- Detailed error logging

✅ **Logging**
- All operations logged to `data/logs/{date}.log`
- Info/debug/warn/error levels
- Extraction counts and metrics
- Timestamps for all entries

## Selector Strategy

The parser uses a fallback chain for robustness:

1. **data-test-id attributes** (LinkedIn's official selectors)
2. **Class names** (e.g., .title, .company, .skill)
3. **Tag names** (e.g., h3, h4, li)
4. **Custom data attributes** (data-section, data-*)

This ensures parsing works across different LinkedIn HTML variations.

## Integration Example

```javascript
// In your data pipeline
import { parseAndSaveLinkedInHTML } from './src/parser_linkedin.js';
import { aggregateData } from './src/aggregator.js';

// Parse LinkedIn HTML
const linkedinData = await parseAndSaveLinkedInHTML(
  'data/raw/linkedin_raw.html',
  'data/processed/linkedin_mined.json'
);

// Aggregate with other sources
const allData = await aggregateData([linkedinData]);

// Save aggregated results
saveJSON('data/final/complete_profile.json', allData);
```

## Files Created

- `src/parser_linkedin.js` - Main parser module
- `data/raw/linkedin_raw.html` - Sample test HTML
- `data/processed/linkedin_mined.json` - Parsed output
- `example_parser.js` - Usage example
- `docs/PARSER_LINKEDIN.md` - Full documentation

## Logging Output

Logs are saved to `data/logs/{YYYY-MM-DD}.log`:

```
[2026-03-20T13:26:14.651Z] INFO: Starting LinkedIn HTML parser
[2026-03-20T13:26:14.669Z] DEBUG: Bio extracted {"length":64}
[2026-03-20T13:26:14.672Z] DEBUG: Experience entries extracted {"count":2}
[2026-03-20T13:26:14.673Z] DEBUG: Skills extracted {"count":10}
[2026-03-20T13:26:14.676Z] INFO: LinkedIn data saved {...}
```

## Troubleshooting

**No data extracted?**
- Check HTML file exists at path
- Verify HTML structure matches selectors
- Check logs in `data/logs/` for details

**Empty arrays/strings?**
- This is normal! The parser gracefully returns empty values for missing sections
- Check the HTML has the expected structure

**Errors in logs?**
- Parser continues even with partial failures
- Check logs for which sections failed to extract
- Verify HTML file format is valid

---

For detailed documentation, see: `docs/PARSER_LINKEDIN.md`

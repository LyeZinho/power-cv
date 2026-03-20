# Job Requirement Parser Implementation

## Overview
Successfully created `src/parser_job.js` - a regex-based job requirement parser that extracts structured data from plain-text job descriptions without using AI or external APIs.

## Features Implemented

### 1. **Title Extraction**
- Extracts title from first markdown heading (# or ##)
- Falls back to first substantial non-empty line

### 2. **Skill Categorization**
- **Required Skills**: Found in "must have", "required", "must know" sections
- **Nice-to-Have**: Found in "nice to have", "optional", "preferred" sections
- Duplicate removal: Skills appearing in both categories kept only in required
- Case-insensitive matching with exact keyword lookup

**Supported Skills Database:**
- Frontend: React, Vue, Angular, Svelte
- Backend: Node.js, Express, NestJS, Django, Flask
- Databases: PostgreSQL, MongoDB, MySQL, Redis, Cassandra
- DevOps: AWS, GCP, Azure, Docker, Kubernetes
- Languages: JavaScript, TypeScript, Python, Go, Rust, Java
- Concepts: GraphQL, REST, Microservices, SOLID, TDD

### 3. **Years of Experience Extraction**
- Regex pattern: `/(\d+)\+?\s+(?:years?|yrs?)\s+(?:of\s+)?(?:software\s+)?(?:development\s+)?experience/i`
- Prioritizes highest year count when multiple matches found
- Supports formats: "5+ years", "5 years", "3 years of experience"

### 4. **Seniority Level Classification**
- Explicit labels: "senior", "mid-level", "junior"
- Calculated from years when no explicit label:
  - 0-2 years → junior
  - 3-4 years → mid
  - 5+ years → senior
- Explicit labels take precedence over calculated values

### 5. **Keywords Extraction**
- Heuristic patterns: distributed, scalable, microservice, cloud, security, performance, optimize, optimization, high-availability, load-balancing
- Case-insensitive matching

### 6. **Output Structure**
```json
{
  "title": "Job Title",
  "required_skills": ["skill1", "skill2"],
  "nice_to_have": ["skill3"],
  "years_experience": 5,
  "seniority_level": "senior",
  "tech_stack": ["skill1", "skill2"],
  "keywords": ["distributed", "scalable"],
  "extracted_at": "2026-03-20T14:01:43.065Z"
}
```

### 7. **Logging**
- All operations logged with timestamps and details
- Log file: `data/logs/YYYY-MM-DD.log`
- Success: Logs skill count and seniority
- Errors: Logs error messages with file path

### 8. **Error Handling**
- Missing files: Returns empty structure with null values
- Empty descriptions: Handled gracefully
- Parse errors: Caught and logged with error field in output

## Public API

### `parseJob(jobFilePath)`
Parses a job description file and returns structured data.

**Parameters:**
- `jobFilePath` (string): Path to job description text file

**Returns:**
- Parsed job object with all extracted fields

**Example:**
```javascript
import { parseJob } from './src/parser_job.js';

const result = parseJob('data/raw/vaga.txt');
console.log(result.title, result.seniority_level);
```

### `parseAndSaveJob(inputPath, outputPath)`
Parses job and saves result to JSON file.

**Parameters:**
- `inputPath` (string): Path to job description text file
- `outputPath` (string): Path to save JSON output

**Example:**
```javascript
import { parseAndSaveJob } from './src/parser_job.js';

parseAndSaveJob('data/raw/vaga.txt', 'data/processed/job_parsed.json');
```

## Test Results

### Test 1: Full Job Description
```
Title: Senior Full-Stack Developer - E-commerce Platform
Years: 5
Seniority: senior
Required Skills: 18 items
Nice-to-Have: 8 items
Keywords: 8 items (distributed, scalable, microservice, cloud, security, performance, optimize, optimization)
```

### Test 2: Simple Job
```
Title: Junior React Developer
Years: 2
Seniority: junior
Required Skills: 5 (react, vue, node.js, node, express)
Nice-to-Have: 1 (python)
```

### Test 3: Edge Cases
- Non-existent file: Returns empty structure ✓
- Empty file: Handled gracefully ✓
- Duplicate skills: Removed correctly ✓

## Dependencies
- `logger.js` - For logging operations
- `utils.js` - For file I/O and JSON operations

## Integration
The parser is ready for use in the CV on Steroids pipeline:
1. Reads plain-text job descriptions
2. Extracts structured requirements
3. Saves to JSON for downstream processing
4. All operations logged for debugging and auditing

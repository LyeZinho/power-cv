# Orchestrator (index.js)

Main entry point for the power-cv 3-phase pipeline.

## Overview

The orchestrator coordinates:
- **Phase 1 (Mining)**: GitHub API mining + LinkedIn scraping
- **Phase 2 (Processing)**: LinkedIn HTML parsing + GitHub DNA analysis
- **Phase 3 (Aggregation)**: Job parsing + master context generation

## Usage

### Basic Usage

```bash
# Auto-detect checkpoints and resume from latest
node index.js

# Or via npm script
npm start
```

### CLI Arguments

```bash
# Clear all checkpoints and start fresh
node index.js --fresh

# Resume from specific phase
node index.js --resume-from phase_1
node index.js --resume-from phase_2
node index.js --resume-from phase_3

# Show help
node index.js --help
```

## Environment Variables

Create a `.env` file in the project root:

```env
GITHUB_USERNAME=your-github-username
LINKEDIN_USERNAME=your-linkedin-username
GITHUB_TOKEN=ghp_your_github_token_here
```

**Defaults:**
- `GITHUB_USERNAME`: 'your-github-username'
- `LINKEDIN_USERNAME`: 'your-linkedin-username'
- `GITHUB_TOKEN`: Required for GitHub mining

## Checkpoint System

The orchestrator uses a checkpoint system to enable recovery and resumption.

### Checkpoint Files

Located in `.checkpoint/`:
- `phase_1.json`: Mining complete
- `phase_2.json`: Processing complete
- `phase_3.json`: Aggregation complete

### Checkpoint Format

```json
{
  "phase": "phase_1",
  "timestamp": "2026-03-20T14:00:00.000Z",
  "data": {
    "type": "mining_complete",
    "repos": 10
  }
}
```

### Checkpoint Behavior

**Auto-detection:**
- If checkpoints exist, phases are skipped
- Only missing phases are executed

**--fresh flag:**
- Clears all checkpoints
- Starts from Phase 1

**--resume-from flag:**
- Forces execution from specified phase
- Overrides checkpoint detection

## Pipeline Phases

### Phase 1: Mining

**Operations:**
1. GitHub API mining (`mine(username)`)
   - Fetches repositories
   - Fetches commits with details
   - Fetches README files
   - Output: `data/raw/github_raw.json`

2. LinkedIn scraping (`scrape(username)`)
   - Uses persistent browser context
   - Saves raw HTML
   - Output: `data/raw/linkedin_raw.html`

**Checkpoint:** Saved after both operations complete

**Skip Condition:** `phase_1.json` checkpoint exists

### Phase 2: Processing

**Operations:**
1. LinkedIn HTML parsing (`parseLinkedInHTML()`)
   - Extracts bio, experience, skills, education, activity
   - Output: `data/processed/linkedin_mined.json`

2. GitHub DNA analysis (`analyze()`)
   - Analyzes commit patterns
   - Classifies technologies (ACTIVE/STABLE/LEGACY)
   - Profiles (Builder/QA/Architect/Maintainer)
   - Output: `data/processed/tech_dna.json`

**Checkpoint:** Saved after both operations complete

**Skip Condition:** `phase_2.json` checkpoint exists AND Phase 1 not run

### Phase 3: Aggregation

**Operations:**
1. Job parsing (`parseJob('vaga.txt')`)
   - Extracts title, skills, experience requirements
   - Output: `data/processed/job_parsed.json`

2. Master context aggregation (`aggregate()`)
   - Cross-references LinkedIn skills with GitHub tech DNA
   - Combines all data sources
   - Output: `data/processed/master_context.json`

**Checkpoint:** Saved after both operations complete

**Skip Condition:** `phase_3.json` checkpoint exists AND earlier phases not run

## Error Handling

- **All errors** are logged with full stack traces
- **Pipeline stops** on first error
- **Exit code 1** on failure
- **Exit code 0** on success
- **Logs** are written to `data/logs/YYYY-MM-DD.log`

## Output Files

### Raw Data (`data/raw/`)
- `github_raw.json`: Raw GitHub API response
- `linkedin_raw.html`: Raw LinkedIn HTML

### Processed Data (`data/processed/`)
- `linkedin_mined.json`: Parsed LinkedIn profile
- `tech_dna.json`: GitHub technology analysis
- `job_parsed.json`: Parsed job description
- `master_context.json`: Combined master context

### Checkpoints (`.checkpoint/`)
- `phase_1.json`: Mining checkpoint
- `phase_2.json`: Processing checkpoint
- `phase_3.json`: Aggregation checkpoint

### Logs (`data/logs/`)
- `YYYY-MM-DD.log`: Daily log file with all operations

## Examples

### Full Fresh Run

```bash
node index.js --fresh
```

**Behavior:**
1. Clears all checkpoints
2. Runs Phase 1 (Mining)
3. Runs Phase 2 (Processing)
4. Runs Phase 3 (Aggregation)

### Resume After Phase 1 Failure

```bash
# Phase 1 completed but Phase 2 failed
node index.js
```

**Behavior:**
1. Detects `phase_1.json` checkpoint
2. Skips Phase 1
3. Runs Phase 2 (Processing)
4. Runs Phase 3 (Aggregation)

### Force Re-run Phase 2

```bash
node index.js --resume-from phase_2
```

**Behavior:**
1. Skips Phase 1 (if checkpoint exists)
2. Re-runs Phase 2 (even if checkpoint exists)
3. Runs Phase 3

### Test Without Mining

```bash
# Manually create phase_1 checkpoint with existing data
echo '{"phase":"phase_1","timestamp":"2026-03-20T14:00:00.000Z","data":{"type":"mining_complete","repos":10}}' > .checkpoint/phase_1.json

# Run pipeline
node index.js
```

**Behavior:**
1. Detects `phase_1.json` checkpoint
2. Skips Phase 1
3. Runs Phase 2 and 3 with existing raw data

## Logging

All operations are logged with:
- Timestamp (ISO 8601)
- Log level (INFO/ERROR/WARN/DEBUG)
- Message
- Context data (JSON)

**Example log entry:**

```
[2026-03-20T14:06:35.386Z] INFO: Phase Execution Plan {"phase_1":"RUN","phase_2":"SKIP","phase_3":"SKIP"}
```

## Architecture

```
index.js (Orchestrator)
├── Phase 1: Mining
│   ├── miner_github.js
│   └── scraper_linkedin.js
├── Phase 2: Processing
│   ├── parser_linkedin.js
│   └── analyzer_dna.js
├── Phase 3: Aggregation
│   ├── parser_job.js
│   └── aggregator.js
└── Core Utilities
    ├── checkpoint.js
    ├── logger.js
    └── utils.js
```

## Module Imports

```javascript
import { mine } from './src/miner_github.js';
import { scrape } from './src/scraper_linkedin.js';
import { parseLinkedInHTML } from './src/parser_linkedin.js';
import { analyze } from './src/analyzer_dna.js';
import { parseJob } from './src/parser_job.js';
import { aggregate } from './src/aggregator.js';
import { initCheckpoints, saveCheckpoint, loadCheckpoint, clearAllCheckpoints } from './src/checkpoint.js';
import logger from './src/logger.js';
```

## Exit Codes

- **0**: Success - all phases completed
- **1**: Failure - error occurred during execution

## Troubleshooting

### GitHub 401 Error

**Problem:** `Request failed with status code 401`

**Solution:** Check `GITHUB_TOKEN` in `.env` file

### LinkedIn Login Required

**Problem:** `Not logged in to LinkedIn`

**Solution:** Run LinkedIn scraper manually first to login with persistent browser

### Phase Stuck on Checkpoint

**Problem:** Pipeline skips phase even when you want to re-run

**Solution:** Use `--fresh` flag to clear checkpoints or `--resume-from` to force re-run

### Missing Raw Data Files

**Problem:** Phase 2 fails with "file not found"

**Solution:** Run Phase 1 first or ensure raw data files exist in `data/raw/`

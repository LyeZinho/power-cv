# Orchestrator Quick Reference

## Main Entry Point

```bash
node index.js [OPTIONS]
```

## CLI Options

| Option | Description | Example |
|--------|-------------|---------|
| `--help` | Show help message and exit | `node index.js --help` |
| `--fresh` | Clear all checkpoints and start from phase 1 | `node index.js --fresh` |
| `--resume-from PHASE` | Resume from specific phase | `node index.js --resume-from phase_2` |
| _(none)_ | Auto-detect latest checkpoint or start fresh | `node index.js` |

## Valid Phase Values

- `phase_1` - Mining (GitHub + LinkedIn)
- `phase_2` - Processing (Parsing + Analysis)
- `phase_3` - Aggregation (Job + Master Context)

## Environment Variables

```env
GITHUB_USERNAME=your-github-username
LINKEDIN_USERNAME=your-linkedin-username
GITHUB_TOKEN=ghp_your_token_here
```

## Checkpoint Files

Located in `.checkpoint/`:
- `phase_1.json` - Mining complete
- `phase_2.json` - Processing complete
- `phase_3.json` - Aggregation complete

## Output Files

### Raw Data (`data/raw/`)
- `github_raw.json` - GitHub API raw response
- `linkedin_raw.html` - LinkedIn raw HTML

### Processed Data (`data/processed/`)
- `linkedin_mined.json` - Parsed LinkedIn profile
- `tech_dna.json` - GitHub technology DNA
- `job_parsed.json` - Parsed job description
- **`master_context.json`** - **Final master context (ready for AI CV synthesis)**

## Common Workflows

### Fresh Start
```bash
node index.js --fresh
```

### Resume After Failure
```bash
node index.js
```

### Re-run Specific Phase
```bash
node index.js --resume-from phase_2
```

### Skip Mining (Use Existing Data)
```bash
# Create mock checkpoint
echo '{"phase":"phase_1","timestamp":"2026-03-20T14:00:00.000Z","data":{"type":"mining_complete","repos":10}}' > .checkpoint/phase_1.json

# Run pipeline
node index.js
```

## Exit Codes

- **0** - Success
- **1** - Failure (error logged with stack trace)

## Logs

All operations logged to: `data/logs/YYYY-MM-DD.log`

## Error Handling

- Full stack traces logged
- Pipeline stops on first error
- Use checkpoints to resume from last successful phase

## Module Architecture

```
index.js (Orchestrator)
├── Phase 1: Mining
│   ├── miner_github.js (GitHub API)
│   └── scraper_linkedin.js (Playwright scraper)
├── Phase 2: Processing
│   ├── parser_linkedin.js (Cheerio parser)
│   └── analyzer_dna.js (Tech DNA analysis)
├── Phase 3: Aggregation
│   ├── parser_job.js (Job description parser)
│   └── aggregator.js (Master context builder)
└── Core
    ├── checkpoint.js (Checkpoint system)
    ├── logger.js (Logging system)
    └── utils.js (File utilities)
```

## Quick Troubleshooting

| Error | Solution |
|-------|----------|
| 401 GitHub API error | Check `GITHUB_TOKEN` in `.env` |
| LinkedIn login required | Run scraper manually first with browser |
| Phase skipped unexpectedly | Use `--fresh` or `--resume-from` |
| File not found | Ensure previous phase completed or raw data exists |

## Verification

```bash
# Check if orchestrator works
node index.js --help

# Check environment
cat .env

# Check checkpoints
ls -la .checkpoint/

# Check output
ls -la data/processed/master_context.json
```

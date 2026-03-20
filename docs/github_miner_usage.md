# GitHub Data Miner Usage

## Overview
Extracts comprehensive GitHub repository data including repos, READMEs, and commit history with intelligent rate-limiting.

## Setup

### Prerequisites
- Node.js >= 18.0.0
- GitHub Personal Access Token

### Environment Configuration
Create a `.env` file with your GitHub token:
```
GITHUB_TOKEN=ghp_your_token_here
```

## Usage

### Basic Usage
```javascript
import { mine } from './src/miner_github.js';

const data = await mine('username');
```

### Output Structure
```json
{
  "user": "username",
  "mining_timestamp": "2026-03-20T10:00:00.000Z",
  "repos": [
    {
      "name": "repo-name",
      "url": "https://github.com/user/repo",
      "status": "OWNED|CONTRIBUTED",
      "readme": "First 2000 chars of README...",
      "languages": { "JavaScript": 100 },
      "topics": ["nodejs", "api"],
      "stars": 42,
      "commits": [
        {
          "hash": "abc123...",
          "message": "Add feature X",
          "verb": "Add",
          "files_changed": 5,
          "insertions": 100,
          "deletions": 20,
          "timestamp": "2026-03-20T09:00:00Z",
          "impact": "minor"
        }
      ],
      "velocity": {
        "commits_per_month": 0,
        "trend": "stable",
        "last_commit": "2026-03-20T09:00:00Z"
      }
    }
  ]
}
```

## Rate Limiting

### Strategy
- Sliding window tracker (60-second window)
- Threshold: 4900 requests per window (safety margin under 5000/hour)
- Backoff: 5000ms when near limit, 500ms normal

### Monitoring
Rate limit status is logged at:
- Mining start
- Mining completion
- When threshold is reached

## Checkpoints
Partial data is saved every 10 repositories to:
```
data/raw/github_raw_partial_1.json
data/raw/github_raw_partial_2.json
...
```

## Final Output
Complete data saved to:
```
data/raw/github_raw.json
```

## Error Handling

### Graceful Degradation
- Missing README (404) → Returns `null`, continues processing
- Commit detail fetch failure → Uses basic commit info with zero stats
- Repo processing failure → Logs error, continues with next repo

### Logging
All operations logged to:
```
data/logs/YYYY-MM-DD.log
```

## API Limits

### GitHub Rate Limits
- 5000 requests/hour for authenticated requests
- Miner stays under 4900 req/hour for safety

### Data Limits
- README: First 2000 characters
- Commits: Last 50 per repository
- Repos: All owned + contributed

## Example Run

```bash
# Set environment variable
export GITHUB_TOKEN=ghp_your_token_here

# Run miner
node -e "import('./src/miner_github.js').then(m => m.mine('octocat'))"
```

## Performance Metrics
- ~500-5000ms per API request (depending on rate limiting)
- ~10-30 seconds per repository (with 50 commits)
- Checkpoint every 10 repos ensures data safety

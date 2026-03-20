# CV on Steroids - System Design
**Date**: 2026-03-20  
**Status**: Approved  
**Scope**: Phases 1-3 (Mining, Processing, Aggregation)

## Overview

CV on Steroids is an automated system that mines GitHub and LinkedIn data, analyzes technical DNA, and synthesizes AI-ready context for CV generation matched to job descriptions.

### User Journey
1. Run pipeline → automatically mines GitHub (owned + contributed repos) and LinkedIn (full profile audit)
2. System analyzes tech DNA (recency + velocity + importance) and commits (builder/maintainer/architect/QA profiles)
3. Paste job description into `vaga.txt` → system parses requirements
4. Aggregates all data into `master_context.json` ready for AI CV synthesis (Gemini integration later)

---

## Architecture

### Three-Phase Pipeline

```
PHASE 1: DATA MINING
├─ GitHub Miner (repos, README, 50 commits + diffs)
└─ LinkedIn Scraper (full profile: experience, skills, activity feed)
         ↓
PHASE 2: PROCESSING & DNA ANALYSIS
├─ LinkedIn Parser (extract structured experience/skills)
└─ GitHub DNA Analyzer (tech recurrence, status classification, commit profiling)
         ↓
PHASE 3: AGGREGATION & AI SCAFFOLD
├─ Job Parser (regex + heuristics for requirement extraction)
└─ Aggregator (merge into master_context.json, ready for Gemini)
```

### Checkpoint System
- `.checkpoint/phase_1.json` — Mining state
- `.checkpoint/phase_2.json` — Processing state
- `.checkpoint/phase_3.json` — Aggregation state
- Resume from any checkpoint via CLI or auto-detect from latest

---

## Data Schema (Nested Hierarchical)

### Root Structure
```json
{
  "github": { ... },
  "linkedin": { ... },
  "job": { ... },
  "metadata": { "extracted_at": "ISO8601", "version": "1.0" }
}
```

### GitHub Section
```json
{
  "github": {
    "user": "username",
    "repos": [
      {
        "name": "repo-name",
        "url": "https://github.com/user/repo",
        "status": "OWNED|CONTRIBUTED",
        "readme": "First 2000 chars of README",
        "languages": { "JavaScript": 60, "TypeScript": 40 },
        "topics": ["web", "api"],
        "stars": 42,
        "commits": [
          {
            "hash": "abc123def456",
            "message": "Add feature X",
            "verb": "Add|Fix|Refactor|Docs|etc",
            "files_changed": 5,
            "insertions": 120,
            "deletions": 45,
            "timestamp": "2026-03-15T10:30:00Z",
            "impact": "major|minor"
          }
        ],
        "velocity": {
          "commits_per_month": 8.5,
          "trend": "up|stable|down",
          "last_commit": "2026-03-20T10:00:00Z"
        }
      }
    ],
    "tech_dna": {
      "technologies": [
        {
          "name": "React",
          "status": "ACTIVE|STABLE|LEGACY",
          "first_seen": "2024-01-15",
          "last_seen": "2026-03-20",
          "repo_count": 5,
          "total_commits": 42,
          "velocity_trend": "up|stable|down",
          "profile": "Builder|Maintainer|Architect|QA",
          "importance_score": 0.95
        }
      ]
    }
  }
}
```

### LinkedIn Section
```json
{
  "linkedin": {
    "profile_url": "https://linkedin.com/in/username",
    "bio": "Bio text",
    "headline": "Job title",
    "experience": [
      {
        "title": "Senior Engineer",
        "company": "Company X",
        "period": { "start": "2023-01", "end": "2026-03" },
        "duration_months": 39,
        "description": "Full description",
        "skills_mentioned": ["React", "Node.js"],
        "location": "Remote"
      }
    ],
    "skills": ["React", "Node.js", "PostgreSQL"],
    "education": [
      {
        "school": "University X",
        "degree": "B.Sc. Computer Science",
        "field": "Computer Science",
        "graduated": "2020"
      }
    ],
    "activity": {
      "posts_count": 12,
      "engagement_score": 0.65
    }
  }
}
```

### Job Section
```json
{
  "job": {
    "source": "vaga.txt",
    "title": "Senior Full-Stack Engineer",
    "required_skills": ["React", "Node.js", "PostgreSQL"],
    "nice_to_have": ["AWS", "Docker", "Kubernetes"],
    "years_experience": 5,
    "seniority_level": "senior|mid|junior",
    "tech_stack": ["JavaScript", "Python"],
    "keywords": ["distributed systems", "scalability"],
    "extracted_at": "2026-03-20T10:30:00Z"
  }
}
```

---

## Component Specifications

### Phase 1: Mining

#### `src/miner_github.js`
- **Input**: GITHUB_TOKEN from .env
- **Process**:
  1. Fetch all repos (paginated, owned + contributed)
  2. For each repo:
     - Extract README (first 2000 chars)
     - Fetch last 50 commits
     - Parse commit diffs (files_changed, insertions, deletions, impact)
  3. Rate limit: 5000 req/hr sliding window, exponential backoff
- **Output**: `data/raw/github_raw.json`
- **Checkpoint**: Save after each 10 repos

#### `src/scraper_linkedin.js`
- **Input**: Playwright persistent context (assumes already logged in via `user_data/` directory)
- **Process**:
  1. Load persistent context from `user_data/linkedin`
  2. Navigate to profile
  3. Expand all sections (Experience, Skills, Education, Activity)
  4. Scroll through full activity feed
  5. Screenshot validation (detect if logged out)
- **Output**: `data/raw/linkedin_raw.html` + `data/raw/linkedin_data.json`
- **Checkpoint**: Save after each major section

#### Rate Limiting Strategy
- GitHub: Sliding window counter (track timestamps, backoff when approaching 5000 limit)
- LinkedIn: 1-2 second delays between actions, exponential backoff on 429 responses

### Phase 2: Processing & Analysis

#### `src/parser_linkedin.js`
- **Input**: `data/raw/linkedin_raw.html`
- **Process**:
  1. Parse HTML with Cheerio
  2. Extract: bio, headline, experience (title, company, period, description)
  3. Extract: skills, education
  4. Validate dates and durations
- **Output**: `data/processed/linkedin_mined.json`

#### `src/analyzer_dna.js`
- **Input**: `data/raw/github_raw.json`
- **Process**:
  1. **Tech Recurrence**: For each technology, calculate first_seen, last_seen, commit count, repo count
  2. **Status Classification** (Hybrid):
     - Recency: last commit < 3 months → boost ACTIVE score
     - Velocity: commits_per_month trend (up/stable/down)
     - Importance: repo stars + language popularity (JavaScript > Python > Go, etc.)
     - Score = (recency_weight × recency_score) + (velocity_weight × velocity_score) + (importance_weight × importance_score)
  3. **Commit Profiling**:
     - Extract verb: "Add" → Builder, "Fix" → QA, "Refactor" → Architect, "Docs" → Maintainer
     - Calculate profile distribution per tech
     - Profile = mode(verb_counts) per technology
  4. **Frequency Patterns**: commits per month trend, time-of-day distribution
- **Output**: `data/processed/tech_dna.json`

### Phase 3: Aggregation & AI Scaffold

#### `src/parser_job.js`
- **Input**: `vaga.txt` (job description plain text)
- **Process**:
  1. Extract title (first line or regex pattern)
  2. Regex patterns for common skill names (React, Node.js, PostgreSQL, etc.)
  3. Heuristics:
     - "X+ years" → seniority_level mapping (0-2=junior, 3-5=mid, 5+=senior)
     - Keywords like "distributed", "scale", "optimize" → tech_focus
     - "Must have" section → required_skills, "Nice to have" → nice_to_have
- **Output**: Structured job object (see schema above)

#### `src/aggregator.js`
- **Input**: `linkedin_mined.json` + `tech_dna.json` + parsed job requirements
- **Process**:
  1. Load all three inputs
  2. Cross-reference: LinkedIn skills ↔ GitHub tech DNA
  3. Merge into unified `master_context.json` structure
  4. Validate completeness (warn if repos < 5, experience < 2, etc.)
- **Output**: `data/processed/master_context.json`

### Checkpoint System

#### `src/checkpoint.js`
- Methods:
  - `saveCheckpoint(phase, data)` → writes to `.checkpoint/{phase}.json`
  - `loadCheckpoint(phase)` → reads from `.checkpoint/{phase}.json`
  - `getLatestCheckpoint()` → returns latest completed phase
  - `clearCheckpoint(phase)` → removes checkpoint (for reruns)

#### CLI Resume Logic
```bash
node index.js --resume-from phase_2    # Skip phase 1, resume from phase 2
node index.js --fresh                  # Clear all checkpoints, start fresh
node index.js                          # Auto-detect latest checkpoint
```

---

## Error Handling & Logging

### Error Recovery
- **GitHub API errors**: Retry 3x with exponential backoff, log quota remaining
- **LinkedIn session timeout**: Detect 401/403, prompt user to re-authenticate
- **Network timeouts**: Save partial results, checkpoint, allow resume
- **Data validation errors**: Log to `data/logs/errors.log`, continue with warnings

### Logging Strategy
- Structured JSON logs to `data/logs/{phase}-{timestamp}.log`
- Levels: `DEBUG` (verbose), `INFO` (progress), `WARN` (recoverable issues), `ERROR` (failures)
- Console output: Progress indicators + error summaries

---

## Folder Structure

```
cv-on-steroids/
├── .checkpoint/                    # Checkpoint state (auto-created)
│   ├── phase_1.json
│   ├── phase_2.json
│   └── phase_3.json
├── .env                            # GitHub token (gitignored)
├── .gitignore
├── data/
│   ├── raw/                        # Raw API responses & HTML
│   │   ├── github_raw.json
│   │   └── linkedin_raw.html
│   ├── processed/                  # Processed structured data
│   │   ├── linkedin_mined.json
│   │   ├── tech_dna.json
│   │   └── master_context.json
│   ├── outputs/                    # Generated CVs (Markdown/PDF)
│   └── logs/                       # Structured logs (auto-created)
├── src/
│   ├── miner_github.js             # Phase 1: GitHub mining
│   ├── scraper_linkedin.js         # Phase 1: LinkedIn scraping
│   ├── parser_linkedin.js          # Phase 2: LinkedIn HTML parsing
│   ├── analyzer_dna.js             # Phase 2: Tech DNA analysis
│   ├── parser_job.js               # Phase 3: Job requirement parsing
│   ├── aggregator.js               # Phase 3: Data aggregation
│   ├── checkpoint.js               # Checkpoint management
│   ├── logger.js                   # Logging utility
│   └── utils.js                    # Helper functions
├── user_data/                      # Playwright persistent context (gitignored)
│   └── linkedin/
├── vaga.txt                        # Job description input (user-provided)
├── index.js                        # Main orchestrator (CLI)
├── package.json
└── README.md
```

---

## Success Criteria

- [ ] Phase 1: GitHub mining extracts all owned + contributed repos with README + 50 commits
- [ ] Phase 1: LinkedIn scraper expands all sections and activity feed
- [ ] Phase 2: Tech DNA classifies all technologies as ACTIVE/STABLE/LEGACY with hybrid scoring
- [ ] Phase 2: Commit profiling assigns Builder/Maintainer/Architect/QA to each tech
- [ ] Phase 3: Job parser extracts required/nice-to-have skills + seniority from vaga.txt
- [ ] Phase 3: master_context.json is valid, complete, and ready for AI synthesis
- [ ] Checkpoint system allows resume from any phase without data loss
- [ ] All errors logged to data/logs/ with clear recovery paths

---

## Next Steps

1. ✅ Design approved
2. → Create implementation plan (writing-plans skill)
3. → Execute Phase 1 (mining)
4. → Execute Phase 2 (processing)
5. → Execute Phase 3 (aggregation)
6. → Validate complete pipeline

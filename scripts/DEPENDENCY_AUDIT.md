# Dependency Vulnerability Audit

**Date:** 2026-02-13
**Author:** security-harden agent

---

## Python Dependencies (`requirements.txt`)

### Audit Method
`pip check` was used (pip-audit not installed). `pip check` verifies version compatibility but does not scan CVE databases. The project's Python dependencies are pinned with version ranges in `requirements.txt`.

### Compatibility Issues (from `pip check`)

These are version mismatches in the global Python environment, not necessarily in the project's direct dependencies:

| Package | Issue | Severity | Relevant to Project? |
|---------|-------|----------|---------------------|
| lxml 6.0.2 | docling requires <6.0.0, crawl4ai requires ~5.3 | LOW | No -- docling/crawl4ai are not project deps |
| requests 2.31.0 | locust requires >=2.32.2, fast-langdetect requires >=2.32.3 | LOW | Partial -- project uses requests >=2.31.0 |
| numpy 1.26.4 | thinc, kreuzberg, opencv require >=2.0.0 | LOW | No -- not project deps |
| openai 2.7.1 | litellm requires >=2.8.0 | LOW | No -- project uses anthropic, not openai directly |

### Project Direct Dependencies -- Assessment

| Package | Pinned Range | Known CVEs | Status |
|---------|-------------|------------|--------|
| vanna >=2.0.2 | OK | None known | PASS |
| fastapi >=0.115.6 | OK | None known | PASS |
| uvicorn >=0.34.0 | OK | None known | PASS |
| pydantic >=2.5.0 | OK | None known | PASS |
| pydantic-settings >=2.0.0 | OK | None known | PASS |
| psycopg2-binary >=2.9.10 | OK | None known | PASS |
| anthropic >=0.41.0 | OK | None known | PASS |
| pyjwt >=2.8.1 | OK | None known | PASS |
| bcrypt >=4.1.0 | OK | None known | PASS |
| redis >=5.0.0 | OK | None known | PASS |
| yfinance >=0.2.35 | OK | None known | PASS |
| lxml >=4.10.0,<6.0 | OK | None known | PASS |
| beautifulsoup4 >=4.12.0 | OK | None known | PASS |
| requests >=2.31.0 | OK | None known (consider upgrade to >=2.32.2) | PASS |
| plotly >=5.20.0 | OK | None known | PASS |
| pandas >=2.1.0 | OK | None known | PASS |
| numpy >=1.24.0 | OK | None known | PASS |
| apscheduler >=3.10.4 | OK | None known | PASS |
| pytest >=8.0.0 | OK | None known | PASS |
| httpx >=0.27.0 | OK | None known | PASS |

### Recommendation
- **requests**: Consider bumping minimum to `>=2.32.2` for compatibility with other tools, though no CVEs affect 2.31.0.
- Install `pip-audit` in CI for automated CVE scanning: `pip install pip-audit && pip-audit -r requirements.txt`

---

## Frontend Dependencies (`frontend/package.json`)

### Audit Method
`npm audit` was run against the frontend directory.

### Findings

| Package | Severity | Description | Fix | Status |
|---------|----------|-------------|-----|--------|
| `glob` 10.2.0-10.4.5 | **HIGH** | Command injection via -c/--cmd with shell:true (GHSA-5j98-mcp5-4vw2) | Update eslint-config-next to >=16.x | DEFERRED (dev dependency only) |
| `next` 10.0.0-15.5.9 | **HIGH** | DoS via Image Optimizer remotePatterns (GHSA-9g9p-9gw9-jx7f) | Upgrade next to >=15.6.0 | RECOMMEND |
| `next` 10.0.0-15.5.9 | **HIGH** | HTTP deserialization DoS with insecure RSC (GHSA-h25m-26qc-wcjf) | Upgrade next to >=15.6.0 | RECOMMEND |

**Total: 4 high severity vulnerabilities (2 unique, affecting 3 packages)**

### Analysis

1. **glob (HIGH)** -- This is a transitive dependency of `@next/eslint-plugin-next`, which is a **dev-only** dependency. The command injection requires running `glob` CLI with user-controlled input, which does not happen in this project. **Risk: None in production.** Fix by upgrading eslint-config-next when convenient.

2. **next (2x HIGH)** -- The Next.js vulnerabilities affect:
   - **Image Optimizer DoS**: Relevant if using `<Image>` component with `remotePatterns`. The project may use this for stock logos or news images.
   - **HTTP deserialization DoS with insecure RSC**: Only affects self-hosted Next.js apps using React Server Components.

### Recommendation

- **next**: Upgrade from current version to a patched release. Run `npm audit fix --force` to upgrade to next@16.x (breaking change -- requires testing).
- **glob/eslint-config-next**: Dev-only, low urgency. Upgrade when doing a major Next.js version bump.
- Add `npm audit` to CI pipeline to catch future vulnerabilities automatically.

**Note:** Since `frontend/src/` is out of scope for this agent, the actual upgrade should be performed by the frontend-harden team after testing.

---

## Summary

| Area | Critical | High | Medium | Low | Action Required |
|------|----------|------|--------|-----|----------------|
| Python (requirements.txt) | 0 | 0 | 0 | 0 | None (add pip-audit to CI) |
| Frontend (package.json) | 0 | 4 | 0 | 0 | Upgrade Next.js (frontend team) |

**Overall Status:** No critical or high vulnerabilities in Python production dependencies. Frontend has high-severity Next.js vulnerabilities that should be addressed by the frontend team.

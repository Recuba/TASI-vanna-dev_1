# Frontend Tester Plan (Task #7)

## Overview
Create Playwright E2E tests, load testing scripts, and security scan configuration for the Ra'd AI frontend. This task creates test files ONLY -- no source code modifications.

## Files to Create

### Task 1: Playwright E2E Setup
- `frontend/e2e/playwright.config.ts` - Playwright configuration
  - Base URL: http://localhost:3000
  - Browsers: chromium + firefox
  - Screenshot on failure, video on retry
  - 4 workers, 30s timeout per test
  - Test dir: `./tests`
- `frontend/e2e/global-setup.ts` - Global setup
  - Verify dev server is reachable at localhost:3000
  - Create test session data (localStorage tokens for test users)
- `frontend/package.json` updates (devDependencies + scripts only):
  - Add `@playwright/test` to devDependencies
  - Add scripts: `test:e2e`, `test:e2e:ui`

### Task 2: Authentication E2E Tests
- `frontend/e2e/tests/auth.spec.ts` - 8+ test cases:
  1. Login page renders with email/password fields
  2. Login page shows Sign In / Register toggle
  3. Successful login redirects to /chat
  4. Failed login shows error message
  5. Register mode shows name field
  6. Logout clears session and redirects
  7. Guest login button works
  8. Protected route redirects to /login
  9. Login page shows RTL Arabic text

### Task 3: Query Flow E2E Tests
- `frontend/e2e/tests/query-flow.spec.ts` - 10+ test cases:
  1. Chat page loads with input field
  2. Submit query shows loading state
  3. Query results display in message bubbles
  4. SQL block renders in response
  5. Chart renders in response (if data)
  6. Query suggestions are clickable
  7. Data table renders with results
  8. Chat history persists on navigation
  9. New chat clears conversation
  10. Error response shows error message
  11. Long query text wraps properly

### Task 4: Admin Dashboard E2E Tests
- `frontend/e2e/tests/admin.spec.ts` - 6+ test cases:
  1. Non-admin user cannot access admin routes
  2. Dashboard loads for admin user
  3. Health data displayed (DB status, LLM status)
  4. Market data overview section visible
  5. Navigation between admin sections
  6. Auto-refresh updates data

### Task 5: Load Testing Scripts
- `frontend/e2e/load-tests/locust-frontend.py` - Locust load test
  - HttpUser with tasks for: home page, login, chat page, market page, news feed, charts page
  - Configurable: 50-200 concurrent users
  - Wait time: 1-5 seconds between tasks
- `load-test-requirements.txt` (project root): locust>=2.20.0
- `frontend/e2e/load-tests/README.md` - Usage instructions

### Task 6: Security Scan Configuration
- `frontend/.lighthouserc.js` - Lighthouse CI config
  - Performance > 80, Accessibility > 90, Best-practices > 90, SEO > 80
  - Collect from localhost:3000
  - 3 runs per URL
- `frontend/scripts/security-audit.sh` - Security audit script
  - npm audit --audit-level=high
  - npx eslint with security plugin
  - Report generation
- Add `eslint-plugin-security` to devDependencies
- Add npm script: `security:audit`

## Approach
- All E2E tests use Playwright's `test` and `expect` from `@playwright/test`
- Tests mock API responses using `page.route()` to intercept network requests (no real backend needed)
- Auth tests set/check localStorage for token management
- Load tests use Locust Python framework (separate from Node.js)
- Security config uses Lighthouse CI for automated audits

## Constraints
- NEVER modify existing source files in frontend/src/
- NEVER modify Python backend files
- Only create new files in owned directories (frontend/e2e/, frontend/scripts/, project root for load-test-requirements.txt)
- package.json: only add devDependencies and scripts

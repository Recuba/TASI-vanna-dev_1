# Load Testing

Frontend load tests using [Locust](https://locust.io/).

## Setup

```bash
# From the project root
pip install -r load-test-requirements.txt
```

## Running

### Web UI (recommended)

```bash
locust -f frontend/e2e/load-tests/locust-frontend.py --host=http://localhost:3000
```

Open http://localhost:8089 to configure and start the test.

### Headless

```bash
locust -f frontend/e2e/load-tests/locust-frontend.py \
  --host=http://localhost:3000 \
  --users 100 \
  --spawn-rate 10 \
  --run-time 5m \
  --headless \
  --csv=load-test-results
```

## Configuration

| Parameter     | Recommended Range | Description                    |
|---------------|-------------------|--------------------------------|
| `--users`     | 50-200            | Total concurrent simulated users |
| `--spawn-rate`| 5-20              | Users spawned per second       |
| `--run-time`  | 5m-10m            | Duration of the test           |

## Test Scenarios

- **FrontendUser** (weight=3): Simulates anonymous browsing across all pages
- **AuthenticatedUser** (weight=1): Simulates logged-in users performing heavier operations

## Prerequisites

Make sure the frontend dev server is running:

```bash
cd frontend && npm run dev
```

For more realistic results, also run the backend:

```bash
python app.py
```

"""
Performance Load Tests (Locust)
================================
Locust load test profiles for the Ra'd AI TASI Platform.

Profiles:
  - Light load: 50 users, 10 users/sec ramp-up
  - Medium load: 200 users, 25 users/sec ramp-up
  - Heavy load: 500 users, 50 users/sec ramp-up

Tested endpoints:
  - GET /health (liveness, no auth)
  - GET /health/ready (readiness, no auth)
  - POST /api/auth/guest (guest token generation)
  - GET /api/v1/charts/tasi/index (TASI data, read-heavy)
  - GET /api/v1/news/feed (news list)

Run:
  locust -f tests/performance/test_load.py --host=http://localhost:8084

  # Light load (headless):
  locust -f tests/performance/test_load.py --host=http://localhost:8084 \
    --users 50 --spawn-rate 10 --run-time 60s --headless

  # Medium load:
  locust -f tests/performance/test_load.py --host=http://localhost:8084 \
    --users 200 --spawn-rate 25 --run-time 120s --headless

  # Heavy load:
  locust -f tests/performance/test_load.py --host=http://localhost:8084 \
    --users 500 --spawn-rate 50 --run-time 180s --headless
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from locust import HttpUser, between, task, tag
except ImportError:
    # Allow module to be imported for discovery without locust installed
    import pytest

    pytestmark = pytest.mark.skip(reason="locust not installed")

    class HttpUser:
        pass

    def between(*a, **kw):
        return 1

    def task(weight=1):
        def decorator(func):
            return func

        return decorator

    def tag(*tags):
        def decorator(func):
            return func

        return decorator


class HealthCheckUser(HttpUser):
    """User that only hits health check endpoints.

    Simulates monitoring / load balancer probes.
    """

    wait_time = between(0.5, 1.5)
    weight = 3

    @task(5)
    @tag("health")
    def health_check(self):
        self.client.get("/health", name="/health")

    @task(3)
    @tag("health")
    def liveness_check(self):
        self.client.get("/health/live", name="/health/live")

    @task(2)
    @tag("health")
    def readiness_check(self):
        self.client.get("/health/ready", name="/health/ready")


class GuestUser(HttpUser):
    """User that creates guest tokens and accesses public endpoints.

    Simulates anonymous visitors exploring the platform.
    """

    wait_time = between(1, 3)
    weight = 5

    def on_start(self):
        """Get a guest token on start."""
        resp = self.client.post("/api/auth/guest")
        if resp.status_code == 200:
            data = resp.json()
            self.token = data.get("token", "")
        else:
            self.token = ""

    @property
    def _headers(self):
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}

    @task(4)
    @tag("tasi")
    def get_tasi_index(self):
        self.client.get(
            "/api/v1/charts/tasi/index",
            name="/api/v1/charts/tasi/index",
            headers=self._headers,
        )

    @task(3)
    @tag("tasi")
    def get_tasi_3mo(self):
        self.client.get(
            "/api/v1/charts/tasi/index?period=3mo",
            name="/api/v1/charts/tasi/index?period=3mo",
            headers=self._headers,
        )

    @task(2)
    @tag("news")
    def get_news_feed(self):
        self.client.get(
            "/api/v1/news/feed",
            name="/api/v1/news/feed",
            headers=self._headers,
        )

    @task(1)
    @tag("auth")
    def guest_login(self):
        self.client.post("/api/auth/guest", name="/api/auth/guest")


class ChartHeavyUser(HttpUser):
    """User that heavily requests chart data.

    Simulates users viewing stock charts repeatedly.
    """

    wait_time = between(0.5, 2)
    weight = 2

    def on_start(self):
        resp = self.client.post("/api/auth/guest")
        if resp.status_code == 200:
            self.token = resp.json().get("token", "")
        else:
            self.token = ""

    @property
    def _headers(self):
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}

    @task(5)
    @tag("tasi")
    def get_tasi_index_default(self):
        self.client.get(
            "/api/v1/charts/tasi/index",
            name="/api/v1/charts/tasi/index",
            headers=self._headers,
        )

    @task(3)
    @tag("tasi")
    def get_tasi_1y(self):
        self.client.get(
            "/api/v1/charts/tasi/index?period=1y",
            name="/api/v1/charts/tasi/index?period=1y",
            headers=self._headers,
        )

    @task(2)
    @tag("tasi")
    def get_tasi_6mo(self):
        self.client.get(
            "/api/v1/charts/tasi/index?period=6mo",
            name="/api/v1/charts/tasi/index?period=6mo",
            headers=self._headers,
        )

    @task(1)
    @tag("health")
    def check_health(self):
        self.client.get("/health", name="/health")

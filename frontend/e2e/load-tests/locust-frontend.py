"""
Locust load test for the Ra'd AI frontend.

Usage:
    locust -f locust-frontend.py --host=http://localhost:3000

Configure via environment or Locust UI:
    - Users: 50-200 concurrent
    - Spawn rate: 10 users/second
    - Run time: 5-10 minutes for meaningful results
"""

from locust import HttpUser, between, task, tag


class FrontendUser(HttpUser):
    """Simulates a typical user browsing the Ra'd AI frontend."""

    wait_time = between(1, 5)

    def on_start(self):
        """Called when a simulated user starts. Fetches the home page first."""
        self.client.get("/", name="Home Page")

    @task(5)
    @tag("navigation")
    def visit_home(self):
        """Visit the home page (most common action)."""
        self.client.get("/", name="Home Page")

    @task(4)
    @tag("navigation")
    def visit_chat(self):
        """Visit the AI chat page."""
        self.client.get("/chat", name="Chat Page")

    @task(3)
    @tag("navigation")
    def visit_market(self):
        """Visit the market data page."""
        self.client.get("/market", name="Market Page")

    @task(3)
    @tag("navigation")
    def visit_charts(self):
        """Visit the charts page."""
        self.client.get("/charts", name="Charts Page")

    @task(2)
    @tag("navigation")
    def visit_news(self):
        """Visit the news page."""
        self.client.get("/news", name="News Page")

    @task(1)
    @tag("navigation")
    def visit_reports(self):
        """Visit the reports page."""
        self.client.get("/reports", name="Reports Page")

    @task(1)
    @tag("navigation")
    def visit_announcements(self):
        """Visit the announcements page."""
        self.client.get("/announcements", name="Announcements Page")

    @task(2)
    @tag("api")
    def fetch_sectors(self):
        """Fetch sectors API (called by home page)."""
        self.client.get("/api/entities/sectors", name="API: Sectors")

    @task(2)
    @tag("api")
    def fetch_entities(self):
        """Fetch top entities (called by home page)."""
        self.client.get("/api/entities?limit=5", name="API: Entities")

    @task(1)
    @tag("api")
    def fetch_health(self):
        """Check health endpoint."""
        self.client.get("/health", name="API: Health")

    @task(1)
    @tag("api")
    def fetch_news_feed(self):
        """Fetch news feed."""
        self.client.get("/api/v1/news/feed?limit=10", name="API: News Feed")

    @task(1)
    @tag("auth")
    def visit_login(self):
        """Visit the login page."""
        self.client.get("/login", name="Login Page")


class AuthenticatedUser(HttpUser):
    """Simulates an authenticated user performing heavier operations."""

    wait_time = between(2, 8)
    weight = 1  # Lower weight - fewer authenticated users

    def on_start(self):
        """Simulate login by posting to auth endpoint."""
        self.client.post(
            "/api/auth/guest",
            json={},
            name="Auth: Guest Login",
        )

    @task(3)
    @tag("authenticated")
    def browse_market(self):
        """Browse market with sector filter."""
        self.client.get("/market", name="Market Page (Auth)")
        self.client.get("/api/entities?limit=20", name="API: Entities List")

    @task(2)
    @tag("authenticated")
    def view_stock_detail(self):
        """View a specific stock detail page."""
        self.client.get("/stock/2222.SR", name="Stock Detail Page")

    @task(1)
    @tag("authenticated")
    def browse_charts(self):
        """View charts page and fetch TASI index data."""
        self.client.get("/charts", name="Charts Page (Auth)")
        self.client.get(
            "/api/v1/charts/tasi/index?period=1y",
            name="API: TASI Index",
        )

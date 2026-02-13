# =============================================================================
# Stage 1: Builder — install Python dependencies with build tools
# =============================================================================
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build-time system dependencies (gcc for psycopg2, libpq-dev for headers)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# =============================================================================
# Stage 2: Runtime — minimal image with only runtime dependencies
# =============================================================================
FROM python:3.11-slim

# Install tini for proper PID 1 signal handling, libpq for psycopg2 runtime,
# and postgresql-client for entrypoint.sh schema init via psql
RUN apt-get update && \
    apt-get install -y --no-install-recommends tini libpq5 postgresql-client curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed Python packages from builder stage
COPY --from=builder /install /usr/local

# Create non-root user before copying application code
RUN useradd -m -u 1000 -s /bin/bash appuser

# Copy application code
COPY app.py csv_to_sqlite.py saudi_stocks_yahoo_data.csv entrypoint.sh ./
COPY config/ config/
COPY templates/ templates/
COPY chart_engine/ chart_engine/
COPY services/ services/
COPY database/ database/
COPY api/ api/
COPY auth/ auth/
COPY cache/ cache/
COPY middleware/ middleware/
COPY ingestion/ ingestion/

RUN chmod +x entrypoint.sh && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8084

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8084/health || exit 1

# Use tini as init process to handle signals (SIGTERM) properly
ENTRYPOINT ["tini", "--"]
CMD ["./entrypoint.sh"]

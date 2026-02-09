FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for psycopg2 and psql client
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq-dev gcc postgresql-client && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py .
COPY csv_to_sqlite.py .
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
COPY saudi_stocks_yahoo_data.csv .
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

EXPOSE 8084

# Run as non-root user for security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8084/health')" || exit 1

CMD ["./entrypoint.sh"]

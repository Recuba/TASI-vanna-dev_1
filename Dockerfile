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

CMD ["./entrypoint.sh"]

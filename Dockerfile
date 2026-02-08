FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for psycopg2
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq-dev gcc && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py .
COPY csv_to_sqlite.py .
COPY config/ config/
COPY templates/ templates/

EXPOSE 8084

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8084"]

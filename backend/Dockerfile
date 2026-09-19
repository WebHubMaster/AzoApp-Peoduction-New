FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# System dependencies required by WeasyPrint / Cairo / PDF generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies first for Docker layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && pip install emergentintegrations \
       --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

# Copy application
COPY . .

EXPOSE 8080

# Start FastAPI
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
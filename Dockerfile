# Director's Console - Docker Build
# Multi-stage build for CPE (Backend + Frontend)
#
# In development: start.py runs Vite dev server on port 5173
# In Docker: Built frontend is served statically from FastAPI on port 8000

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files first for better caching
COPY CinemaPromptEngineering/frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY CinemaPromptEngineering/frontend/ ./

# Build production frontend
# Default BUILD_MODE='comfyui' outputs to ../ComfyCinemaPrompting/web/app
# We need to create that directory and build there
RUN mkdir -p /app/ComfyCinemaPrompting/web && npm run build

# Stage 2: Python Runtime
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt ./
COPY CinemaPromptEngineering/requirements.txt ./cpe-requirements.txt
RUN pip install --no-cache-dir -r requirements.txt -r cpe-requirements.txt

# Copy application code
COPY CinemaPromptEngineering/api/ ./api/
COPY CinemaPromptEngineering/cinema_rules/ ./cinema_rules/
COPY CinemaPromptEngineering/templates_system/ ./templates_system/

# Copy built frontend from Stage 1 to /app/static
# Vite outputs to ../ComfyCinemaPrompting/web/app when BUILD_MODE=comfyui (default)
COPY --from=frontend-builder /app/ComfyCinemaPrompting/web/app/ ./static/

# Create directories for runtime data
RUN mkdir -p /app/data /app/templates

# Expose port (same as start.py backend port)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Run the application (equivalent to start.py backend)
CMD ["python", "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]

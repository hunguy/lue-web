# Stage 1: Build the React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/lyricflow-ebook-reader
COPY lyricflow-ebook-reader/package*.json ./
RUN npm install
COPY lyricflow-ebook-reader/ ./
RUN npm run build

# Stage 2: Build the Python backend
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies (ffmpeg for audio processing)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY lue/ ./lue/
# Copy the built frontend from Stage 1
COPY --from=frontend-builder /app/lyricflow-ebook-reader/dist ./lyricflow-ebook-reader/dist

# Create a data directory for persistence
ENV LUE_DATA_DIR=/data
RUN mkdir -p /data
# Tell platformdirs to use our volume-mapped directory if possible
# (We will handle this in config.py or via env vars in the app)
ENV XDG_DATA_HOME=/data
ENV XDG_CACHE_HOME=/data/cache

# Expose the port FastAPI runs on
ENV PORT=26516
EXPOSE 26516

# Command to run the application in web mode
CMD ["python", "-m", "lue", "--web"]

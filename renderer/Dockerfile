
FROM python:3.12-slim

WORKDIR /app

# Install LibreOffice and font dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    libreoffice-writer \
    fonts-liberation \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
    fonts-dejavu-core \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Install custom fonts
COPY fonts/ /usr/local/share/fonts/custom/
RUN fc-cache -f -v
# Configure font discovery
ENV HOME=/tmp
ENV PYTHONUNBUFFERED=1

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy renderer source and Word templates
COPY . .

# Render supplies PORT
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-10000} --workers 1 --timeout 180 app:app"]

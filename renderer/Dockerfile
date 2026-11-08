FROM python:3.12-slim-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice fonts-dejavu-core fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn
COPY . .

ENV PREVIEW_FROM_WORD=1
ENV ALLOW_FALLBACK=0
EXPOSE 5001
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "1", "--timeout", "180", "app:app"]

FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=optional
COPY . .
ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "start"]

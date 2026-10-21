FROM node:20-alpine

# Set working directory
WORKDIR /app

# Argument for git commit sha (passed by CI or build)
ARG GIT_COMMIT=dev-local
ENV APP_VERSION=${GIT_COMMIT}
ENV NODE_ENV=production

# Install curl/wget for healthcheck
RUN apk add --no-cache wget

# Copy package descriptors first for Docker layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application source code
COPY . .

# Expose internal web port
EXPOSE 3000

# Container healthcheck
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start web application
CMD ["npm", "start"]

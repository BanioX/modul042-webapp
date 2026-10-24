FROM node:20-alpine

# Set working directory
WORKDIR /app

# Argument for git commit sha (passed by CI or build)
ARG GIT_COMMIT=dev-local
ENV APP_VERSION=${GIT_COMMIT}
ENV NODE_ENV=production

# wget für den Healthcheck ist in node:alpine bereits enthalten (BusyBox)

# Copy package descriptors first for Docker layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Expose internal web port
EXPOSE 3000

# Container healthcheck
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Ohne root-Rechte laufen (Least Privilege)
USER node

# Start web application
CMD ["npm", "start"]

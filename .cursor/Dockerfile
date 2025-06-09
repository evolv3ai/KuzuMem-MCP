# Dockerfile for Cursor Background Agent
FROM node:20-alpine

# Install development tools and utilities
RUN apk add --no-cache \
    git \
    openssh-client \
    curl \
    wget \
    dumb-init \
    python3 \
    py3-pip \
    make \
    g++ \
    bash \
    jq

# Create non-root user with home directory
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -h /home/nodejs -s /bin/bash -G nodejs -u 1001 nodejs

# Set up Node.js global packages directory for the user
RUN mkdir -p /home/nodejs/.npm-global && \
    chown -R nodejs:nodejs /home/nodejs

# Switch to non-root user
USER nodejs

# Configure npm to use user-specific global directory
ENV NPM_CONFIG_PREFIX=/home/nodejs/.npm-global
ENV PATH=$NPM_CONFIG_PREFIX/bin:$PATH

# Set WORKDIR to user's home directory (required for background agents)
WORKDIR /home/nodejs

# Install common development tools globally
RUN npm install -g \
    typescript \
    @types/node \
    ts-node \
    nodemon \
    eslint \
    prettier \
    npm-check-updates

# Expose common development ports (can be overridden)
EXPOSE 3000 3001 5000 8080

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command - agent will override this
CMD ["/bin/bash"]

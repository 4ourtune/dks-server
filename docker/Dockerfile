# Development Dockerfile for API Server
FROM node:18-alpine

# Install necessary packages
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Copy package files first (for better caching)
COPY server/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY server/ .

# Copy database schema files
COPY database/ ./database/

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3000

# Start development server with database initialization
CMD ["npm", "run", "start:docker"]

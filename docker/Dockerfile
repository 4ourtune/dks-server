# Development Dockerfile for API Server
FROM node:18-alpine

# Install necessary packages
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3000

# Start development server
CMD ["npm", "run", "dev"]
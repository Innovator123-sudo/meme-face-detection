# Full-stack on Node 20. postinstall fetches the 139 MB RMN weights (cached
# per deploy), build bundles the React frontend, server.js serves both.
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . ./
RUN npm run build
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
CMD ["node", "server.js"]

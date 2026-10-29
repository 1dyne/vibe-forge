FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/rules/package.json packages/rules/package.json
COPY packages/agents/package.json packages/agents/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm ci
COPY . .
CMD ["npm", "run", "dev"]

FROM node:24-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/rules/package.json packages/rules/package.json
COPY packages/agents/package.json packages/agents/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
# Railway mounts volumes as root, so this image keeps the default user. To
# run as "node", set RAILWAY_RUN_UID or chown the volume first.
# npm을 거치지 않고 바로 띄운다: npm은 종료 신호를 받으면 실패로 보고해서 배포 교체 때마다 "Deploy Crashed" 메일이 갔다
CMD ["node", "scripts/run-next.mjs", "start"]

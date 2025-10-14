FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

ENV NODE_ENV=production
ENV PORT=4444

EXPOSE 4444

CMD ["node", "node_modules/y-webrtc/bin/server.js"]

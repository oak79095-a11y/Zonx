FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm ci --prefix server

ENV NODE_ENV=production
ENV PORT=5199
ENV DB_PATH=/data/limon-bazaar.db
ENV UPLOAD_DIR=/data/uploads

VOLUME ["/data"]
EXPOSE 5199

CMD ["npm", "--prefix", "server", "start"]

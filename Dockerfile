FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY server.js ./
COPY data/ ./data/
COPY admin.html ./
EXPOSE 3000
CMD ["node", "server.js"]

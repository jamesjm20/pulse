FROM node:18-alpine

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY proxy.js .

EXPOSE 8888

CMD ["node", "proxy.js"]

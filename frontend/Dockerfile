FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .
EXPOSE 5734

CMD ["npm", "run", "dev", "--", "--host"]

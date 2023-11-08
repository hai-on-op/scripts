FROM node:18 as build

WORKDIR /app

COPY package.json ./

RUN yarn install

COPY . .

RUN yarn run build

FROM node:18-slim

WORKDIR /app

COPY --from=build /app/package.json /app/yarn.lock ./
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

CMD [ "yarn", "run", "prod:liquidation"]
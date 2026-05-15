# SSO Worker 镜像:Node 18 直接跑 index.js
# 环境变量(在未来云「应用管理」配置,不要写死在镜像里):
#   APP_ID         100tal SSO appid
#   APP_KEY        100tal SSO appkey
#   ALLOW_ORIGINS  允许的前端源,逗号分隔
#   PORT           监听端口(默认 9000,无需手动设)

FROM node:18-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=9000
EXPOSE 9000

CMD ["node", "index.js"]

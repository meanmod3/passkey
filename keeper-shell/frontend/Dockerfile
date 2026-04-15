FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY frontend/package.json ./frontend/
COPY shared/package.json ./shared/
RUN npm install --workspaces --include-workspace-root

COPY frontend ./frontend
COPY shared ./shared

WORKDIR /app/frontend
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

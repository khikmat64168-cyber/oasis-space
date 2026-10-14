# Oasis API — production image.
#
# Two stages: the first compiles TypeScript with every dependency available,
# the second keeps only what the compiled output actually needs. The result
# carries no compiler, no test suite and no source.
#
# Node is pinned to the major version `engines` declares. Alpine keeps the
# image small; nothing here needs glibc.

# ---------- build ----------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Dependencies first, so a source-only change does not reinstall them.
# `npm ci` installs exactly the lockfile and fails if it disagrees with
# package.json — a disagreement is a defect to see, not to resolve silently.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- runtime --------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only. The GraphQL schema is generated in memory
# (`autoSchemaFile: true`), so no schema file has to travel with the build.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# main.ts serves uploads with `express.static('./uploads')` — a path relative
# to the working directory. This is the mount point for the persistent volume:
# without one, every uploaded image disappears on the next deploy.
RUN mkdir -p ./uploads && chown -R node:node ./uploads
VOLUME ["/app/uploads"]

# Do not run as root.
USER node

# Informational: the real port comes from PORT_API at runtime.
EXPOSE 3013

# `npm run start:prod` would also run the prestart kill:port hook, which has
# no meaning in a container that owns its own network namespace.
CMD ["node", "dist/apps/oasis-api/main"]

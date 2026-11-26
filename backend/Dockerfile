# syntax=docker/dockerfile:1
FROM ubuntu:24.04 AS node-base
ARG NODE_VERSION=24.22.3
ARG TARGETARCH

# Install the official Node binary for the target architecture and verify it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl xz-utils libatomic1 libstdc++6 \
    && case "${TARGETARCH}" in amd64) NODE_ARCH=x64 ;; arm64) NODE_ARCH=arm64 ;; *) exit 1 ;; esac \
    && mkdir /tmp/node-download \
    && cd /tmp/node-download \
    && curl --fail --show-error --location --retry 3 --output "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
        "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    && curl --fail --show-error --location --retry 3 --output SHASUMS256.txt \
        "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" \
    && grep " node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz$" SHASUMS256.txt > CHECKSUMS \
    && sha256sum --check --status CHECKSUMS \
    && tar -xJf "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -C /usr/local --strip-components=1 --no-same-owner \
    && cd / \
    && apt-get purge -y --auto-remove curl xz-utils \
    && rm -rf /var/lib/apt/lists/* /tmp/node-download

FROM node-base AS toolchain
WORKDIR /app
# bcrypt ships Linux prebuilds; these tools also support its source-build fallback.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./

FROM toolchain AS production-dependencies
RUN npm ci --omit=dev --no-audit --no-fund

FROM toolchain AS build
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node-base AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --gid 10001 bidwars \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin bidwars \
    && mkdir /app/audioFiles \
    && chown 10001:10001 /app/audioFiles
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER 10001:10001
STOPSIGNAL SIGTERM
CMD ["node", "dist/server.js"]

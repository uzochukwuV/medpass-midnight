# MedPass — build, test and run the demo in a reproducible container.
#
# The Compact compiler is a native binary, not an npm package, so it is fetched
# from its official release. Pin COMPACTC_VERSION to keep builds reproducible.
FROM node:22-bookworm-slim

ARG COMPACTC_VERSION=0.31.1
ARG TARGETARCH

WORKDIR /app

# curl/unzip for the compiler; ca-certificates for HTTPS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl unzip ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install the Compact compiler on PATH.
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) ARCH=x86_64 ;; \
      arm64) ARCH=aarch64 ;; \
      *) echo "unsupported arch: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    URL="https://github.com/midnightntwrk/compact/releases/download/compactc-v${COMPACTC_VERSION}/compactc_v${COMPACTC_VERSION}_${ARCH}-unknown-linux-musl.zip"; \
    curl -fsSL "$URL" -o /tmp/compactc.zip; \
    unzip -q /tmp/compactc.zip -d /tmp/compactc; \
    install -m 0755 /tmp/compactc/compactc /usr/local/bin/compactc; \
    install -m 0755 /tmp/compactc/compactc.bin /usr/local/bin/compactc.bin; \
    install -m 0755 /tmp/compactc/zkir /usr/local/bin/zkir; \
    install -m 0755 /tmp/compactc/zkir-v3 /usr/local/bin/zkir-v3; \
    rm -rf /tmp/compactc /tmp/compactc.zip; \
    compactc --version

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .

# Compile the contract (with proving keys), typecheck and run the test suite.
RUN compactc src/medpass.compact src/managed/medpass \
 && npx tsc --noEmit -p tsconfig.json \
 && node --import tsx --test "tests/**/*.test.ts" \
 && node --import tsx scripts/demo.ts

EXPOSE 12000
CMD ["node", "--import", "tsx", "scripts/dev-server.ts"]

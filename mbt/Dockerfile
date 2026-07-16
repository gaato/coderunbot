FROM debian:trixie-slim AS bot-builder

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        git \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://cli.moonbitlang.com/install/unix.sh | bash

ENV PATH="/root/.moon/bin:${PATH}"

WORKDIR /workspace

COPY discord.mbt/ ./discord.mbt/
COPY mbt/ ./mbt/
COPY moon.work ./moon.work

RUN moon update \
    && moon install \
    && moon build --target native --release


FROM node:24-slim AS texworker-builder

ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:${PATH}"

RUN corepack enable

WORKDIR /build/tex.gaato.net

COPY tex.gaato.net/package.json tex.gaato.net/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tex.gaato.net/ ./
RUN pnpm build \
    && pnpm prune --prod


FROM node:24-trixie-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libssl3t64 \
        zlib1g \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin --no-create-home app

WORKDIR /app/mbt

ENV NODE_ENV=production \
    TEX_WORKER_PATH=./texworker/worker.js \
    PRIVACY_POLICY_FILE=./config/privacy-policy.md \
    OPT_OUT_FILE=./data/opt-out-users.txt

COPY --from=bot-builder --chown=app:app \
    /workspace/_build/native/release/build/gaato/coderunbot/main/main.exe \
    /app/coderunbot
COPY --from=texworker-builder --chown=app:app \
    /build/tex.gaato.net/dist \
    /app/tex.gaato.net/dist
COPY --from=texworker-builder --chown=app:app \
    /build/tex.gaato.net/package.json \
    /app/tex.gaato.net/package.json
COPY --from=texworker-builder --chown=app:app \
    /build/tex.gaato.net/node_modules \
    /app/tex.gaato.net/node_modules
COPY --chown=app:app mbt/texworker/ /app/mbt/texworker/
COPY --chown=app:app mbt/config/privacy-policy.md /app/mbt/config/privacy-policy.md

RUN mkdir -p /app/mbt/data \
    && chown app:app /app/mbt/data

USER app

CMD ["/app/coderunbot"]

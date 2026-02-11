FROM node:22-slim AS frontend

WORKDIR /app/static
COPY static/package.json static/package-lock.json* ./
COPY static/.npmrc ./
ARG WEBAWESOME_NPM_TOKEN
RUN npm ci --ignore-scripts
RUN rm -f .npmrc

FROM rust:latest AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src

COPY src/ src/
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/udstillerguide-whiteboard .
COPY static/ static/
COPY --from=frontend /app/static/node_modules/ static/node_modules/

ARG VERSION=dev
RUN find static/ -name '*.html' -o -name '*.js' -not -path '*/node_modules/*' | xargs sed -i "s/?v=[a-zA-Z0-9_.-]\+/?v=${VERSION}/g"

EXPOSE 3000

CMD ["./udstillerguide-whiteboard"]

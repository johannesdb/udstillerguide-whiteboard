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

ARG VERSION=dev
RUN sed -i "s/?v=[0-9][0-9]*/?v=${VERSION}/g" static/index.html static/board.html static/js/app.js static/js/canvas.js static/js/tools.js static/js/ui.js

EXPOSE 3000

CMD ["./udstillerguide-whiteboard"]

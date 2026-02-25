# Stage 1: download gymctl release binaries
# Uses GitHub's /releases/latest/download redirect — no version pin needed.
FROM debian:bookworm-slim AS downloader

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG GYMCTL_REPO=shart-cloud/gymctl

RUN curl -fsSL \
    "https://github.com/${GYMCTL_REPO}/releases/latest/download/gymctl-linux-amd64" \
    -o /usr/local/bin/gymctl \
    && chmod +x /usr/local/bin/gymctl

# Stage 2: runtime image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    curl \
    ca-certificates \
    wget \
    vim \
    less \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install kubectl
RUN curl -fsSL \
    "https://dl.k8s.io/release/$(curl -fsSL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    -o /usr/local/bin/kubectl \
    && chmod +x /usr/local/bin/kubectl

# Install ttyd (WebSocket shell, serves bash on port 7681)
ARG TTYD_VERSION=1.7.7
RUN wget -q \
    "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.x86_64" \
    -O /usr/local/bin/ttyd \
    && chmod +x /usr/local/bin/ttyd

# Copy release binary from downloader stage
COPY --from=downloader /usr/local/bin/gymctl /usr/local/bin/gymctl

# Bundle all scenario files into the image.
# Scenario YAML is what changes between lab exercises — no image rebuild needed
# for new scenarios once they're added here and a new image is released.
COPY scenarios/ /scenarios/

# Create lab user (non-root) and the labops group.
# gymctl is setgid labops so it can read the protected completion secret file
# at /run/lab/completion_secret without exposing the secret in labuser's env.
RUN useradd -m -s /bin/bash labuser \
    && groupadd -g 1001 labops \
    && chown root:labops /usr/local/bin/gymctl \
    && chmod 2755 /usr/local/bin/gymctl

# Entrypoint script
COPY lab-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
RUN chmod +x /usr/local/bin/lab-entrypoint.sh

EXPOSE 7681

ENTRYPOINT ["/usr/local/bin/lab-entrypoint.sh"]

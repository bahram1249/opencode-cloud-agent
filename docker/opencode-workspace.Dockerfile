FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    openssh-client \
    python3 \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

# OpenCode's documented installer keeps the runtime image independent from
# the API container and guarantees every workspace starts with the CLI present.
RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/root/.opencode/bin:${PATH}"

WORKDIR /workspace
CMD ["sleep", "infinity"]

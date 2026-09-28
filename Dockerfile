FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl bash tar git \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash harness

ENV HOME=/home/harness
USER harness

RUN curl -fsSL https://opencode.ai/install | bash -s -- --no-modify-path

ENV PATH="/home/harness/.opencode/bin:${PATH}"

RUN mkdir -p /home/harness/workspace

ENV REQUESTY_API_KEY=""

WORKDIR /home/harness

ENTRYPOINT ["bash"]

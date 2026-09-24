FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl bash tar git \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash alice

ENV HOME=/home/alice
USER alice

RUN curl -fsSL https://opencode.ai/install | bash -s -- --no-modify-path

ENV PATH="/home/alice/.opencode/bin:${PATH}"

RUN mkdir -p /home/alice/test

ENV REQUESTY_API_KEY=""

WORKDIR /home/alice

ENTRYPOINT ["bash"]

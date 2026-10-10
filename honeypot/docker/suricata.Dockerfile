ARG UBUNTU_IMAGE=ubuntu:24.04@sha256:008173c23f95b170204355c12626cb5a965d779a7e1283b09e9cffbb1bf33ca3
FROM ${UBUNTU_IMAGE}
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends suricata ca-certificates && rm -rf /var/lib/apt/lists/*
CMD ["suricata", "--build-info"]

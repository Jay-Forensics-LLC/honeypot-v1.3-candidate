ARG PYTHON_IMAGE=python:3.12.13-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2
FROM ${PYTHON_IMAGE}
COPY docker/opencanary/requirements.txt /tmp/opencanary-requirements.txt
RUN pip install --no-cache-dir -r /tmp/opencanary-requirements.txt &&     groupadd -g 2000 evidence && useradd -u 10002 -g 2000 -M canary &&     mkdir -p /etc/opencanaryd
ENV PYTHONDONTWRITEBYTECODE=1
USER 10002:2000
ENTRYPOINT ["twistd", "-n", "--umask=0027", "--pidfile=", "-y", "/usr/local/bin/opencanary.tac"]

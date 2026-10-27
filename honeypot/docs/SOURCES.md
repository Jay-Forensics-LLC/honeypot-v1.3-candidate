# Upstream references reviewed during build

These links support configuration choices; they do not replace native validation
against the deployed versions. Reviewed 2026-09-27. Project code is original glue,
not copied upstream source. Images/packages retain their own upstream licenses.

- [Cowrie Docker configuration](https://docs.cowrie.org/en/stable/docker/README.html)
- [Cowrie upstream configuration](https://github.com/cowrie/cowrie/blob/main/src/cowrie/data/etc/cowrie.cfg.dist)
- [Cowrie Docker build layout](https://github.com/cowrie/cowrie/blob/main/docker/Dockerfile)
- [OpenCanary settings](https://github.com/thinkst/opencanary/blob/master/opencanary/data/settings.json)
- [OpenCanary foreground launcher](https://github.com/thinkst/opencanary/blob/master/bin/opencanaryd)
- [Loki storage](https://grafana.com/docs/loki/latest/configure/storage/)
- [Loki filesystem limitations](https://grafana.com/docs/loki/latest/operations/storage/filesystem/)
- [Docker restart policies](https://docs.docker.com/engine/containers/start-containers-automatically/)
- [Compose schema](https://github.com/compose-spec/compose-spec/blob/main/schema/compose-spec.json)

Cowrie 3.1.3's registry manifest and platform digests were verified on 2026-10-27.
Version tags checked for registry existence: cowrie/cowrie:3.1.3,
grafana/loki:3.6.7, grafana/grafana:12.4.1, grafana/alloy:v1.14.1,
python:3.12.13-slim-bookworm. OpenCanary PyPI version 0.9.10 was confirmed.
Registry manifest digests were resolved and pinned in .env.example, Compose defaults
and Dockerfile defaults; docs/IMAGE_REFERENCES.json records these references.
Transitive package dependencies can change; target build records should capture
RepoDigests, pip freeze and dpkg-query output. The bundle is portable, not
a bit-reproducible offline image set. Review available security updates before use.

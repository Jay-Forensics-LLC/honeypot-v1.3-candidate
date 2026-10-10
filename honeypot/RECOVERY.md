# Recovery and rollback

1. Preserve evidence first. `sudo bash scripts/backup.sh` creates a timestamped
   metadata backup and checksum. For payload/PCAP preservation use the documented
   secondary mounted disk option; metadata backups alone are not complete evidence.
2. Quarantine a suspected workload with
   `sudo bash scripts/quarantine-container.sh honeypot-cowrie` (or
   honeypot-opencanary). It saves container metadata and recent logs before Docker
   pause. Pausing halts userspace, so the workload cannot initiate new activity;
   sockets/kernel state remain. It does not erase storage or delete the container.
3. `sudo bash scripts/stop.sh` stops services without deleting bind-mounted data.
   Never run `docker compose down -v`, broad Docker prune commands or rm on evidence.
4. Inspect `backups/firewall/`. A *.ruleset.nft is a review backup of all rules, NOT
   a file to apply indiscriminately. Restore only a trusted owned snapshot with
   `sudo python3 scripts/firewall.py rollback backups/firewall/TIMESTAMP.hp_guard.nft --apply`.
   Decoys must be stopped. Removal is `sudo bash scripts/remove-containment.sh --apply`.
   It deletes only inet hp_guard. Both changes are audited; unrelated tables survive.
5. To resume a paused decoy after investigation, restore/verify hp_guard then use
   `sudo bash scripts/unquarantine-container.sh honeypot-cowrie`. Review before
   unpausing; start.sh refuses active quarantine records. If a quarantined container
   has been stopped, clear its quarantine with this same reviewed command before start.

Source containment examples: `sudo bash scripts/block-source.sh 192.0.2.7 --apply`
and `sudo bash scripts/unblock-source.sh 192.0.2.7 --apply`. 192.0.2.7 is a
documentation address; substitute only a reviewed single observed IP. This never
connects to it. Source blocks act on forwarded decoy traffic and may not affect
host-local Docker proxy paths. They are temporary and do not alter host management.

Backup verification: `sudo bash scripts/restore-check.sh /absolute/backup.tar.gz`.
This reads/checks all archive members and hashes without overwriting the deployment.
For actual restoration, stop services, make a fresh backup, verify the archive,
extract into a NEW empty review directory using `tar --no-same-owner --no-same-permissions
-xzf ARCHIVE -C NEW_DIRECTORY`, then compare and copy only reviewed files. Never
restore a captured file into a runnable application path. Re-run bootstrap to
establish numeric directory ownership on a newly restored target. Existing secrets
are not backed up by the metadata job; preserve them separately in an approved
secret store. Grafana's data directory contains its DB and needs a stopped,
consistent separate copy if you need users/settings beyond provisioning.

For image rollback retain prior image digests and local images. Stop the stack,
set the reviewed prior digest references in .env, and restart after validating
configuration compatibility. Do not prune old images during update. Restore a
matching Loki/Grafana state backup if a version migration was incompatible; never
downgrade database formats blindly. Test upgrades with copied metadata first.

At 95% disk usage health stops PCAP only. Evidence and backups are never pruned.
Investigate capacity, attach reviewed storage, and restart capture manually after
space is restored: `sudo systemctl start honeypot-pcap.service`. If evidence growth
continues, pause decoys and arrange storage rather than deleting incident directories.

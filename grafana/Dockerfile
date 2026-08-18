# Grafana with this project's datasource and dashboard baked in.
#
# The provisioning files would normally be bind-mounted from the repo, but
# Docker on this host is snap-confined (Ubuntu Core) and can only bind-mount
# from a small set of paths — /opt is not one of them, so the daemon reports
# "mkdir /opt/lsn: read-only file system" however writable the directory
# actually is. No other container on this host bind-mounts either.
#
# Copying the files in sidesteps the host mount entirely, and has the better
# property anyway: the dashboard ships with the image it belongs to, so a
# container started anywhere has the same panels.
FROM grafana/grafana:11.4.0

COPY provisioning /etc/grafana/provisioning

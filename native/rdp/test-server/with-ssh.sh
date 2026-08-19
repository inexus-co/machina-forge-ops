#!/bin/bash
#
# Start sshd, then hand over to the image's own entrypoint.
#
# Before, not after: `run.sh` ends in the xrdp foreground process and never returns. sshd reads
# the account database per connection, so the users `run.sh` is about to create can log in even
# though it has not created them yet.
/usr/sbin/sshd
exec /usr/bin/run.sh "$@"

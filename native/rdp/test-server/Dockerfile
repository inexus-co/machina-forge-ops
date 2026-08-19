# The fast image, with a shell on it.
#
# `danchitnis/xrdp` builds for arm64, which on Apple silicon is the difference between a desktop
# in three seconds and one in sixteen — the other image is amd64 only and runs emulated. What it
# does not have is sshd, and a fixture for this mode has to answer both: the whole point of the
# remote maintenance mode is one machine reached two ways, and the agent's commands go over SSH.
FROM danchitnis/xrdp:ubuntu-xfce-next

# `iproute2` for `ss`, `cron` for a crontab to read: the status and inventory panels read a
# machine through its ordinary tools, so a fixture without those tools tests nothing.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssh-server sudo iproute2 cron \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /run/sshd

COPY with-ssh.sh /usr/bin/with-ssh.sh
RUN chmod +x /usr/bin/with-ssh.sh

# The arguments are still the image's own: triplets of username, password, sudo (yes/no).
ENTRYPOINT ["/usr/bin/with-ssh.sh"]

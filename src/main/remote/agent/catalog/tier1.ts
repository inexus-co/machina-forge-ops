import type { CatalogEntry } from "../../../../shared/catalog";

/**
 * Tier 1: the commands somebody here has actually read and classified.
 *
 * This file is the successor of `BUILT_IN_SETS` in `policy.ts` — every allow/quiet judgement that
 * lived there has been carried over, and a few of its mistakes have not. `ip`, `route` and `arp`
 * were quiet-`all` in the old sets although each can change the machine (`ip link set … down`,
 * `arp -d`); here they are `write`, and reading is done through the commands that only read
 * (`ss`, `netstat`, `findmnt`). `env` was quiet-`all` although `env rm …` executes its arguments;
 * here it is `shell`, and `printenv` — which only prints — is `read`.
 *
 * The rule of thumb for classifying, in one line each:
 * - `read`: cannot change the target no matter what it is given.
 * - `verbs`: the *first argument* says which half it is. If the first argument does not decide
 *   (`ip`, `sed -i`, `timedatectl` bare), the entry is `write` — a wrong "always ask" costs a
 *   click, a wrong "never ask" costs a customer's machine.
 * - `shell`: runs what it is handed. Refused by default, not merely confirmed.
 *
 * Destructive names (`rm`, `dd`, `mkfs`, …) are catalogued as `write` so the approval card can
 * describe them; the fact that they can never be made automatic is the policy floor's business,
 * not this file's.
 */

const read = (name: string, os: CatalogEntry["os"], summary: string): CatalogEntry =>
  ({ name, os, summary, class: "read", tier: 1 });

const write = (name: string, os: CatalogEntry["os"], summary: string): CatalogEntry =>
  ({ name, os, summary, class: "write", tier: 1 });

const shell = (name: string, os: CatalogEntry["os"], summary: string): CatalogEntry =>
  ({ name, os, summary, class: "shell", tier: 1 });

/** Takes a script as an argument. Refused on the target; runs in the sandbox instead. */
const code = (name: string, os: CatalogEntry["os"], summary: string): CatalogEntry =>
  ({ name, os, summary, class: "code", tier: 1 });

/** `readVerbs` become `read`; anything else stays the default, which is `write`. */
const verbs = (
  name: string,
  os: CatalogEntry["os"],
  summary: string,
  readVerbs: string[],
): CatalogEntry => ({
  name,
  os,
  summary,
  class: "verbs",
  verbs: Object.fromEntries(readVerbs.map((verb) => [verb, "read" as const])),
  tier: 1,
});

export const TIER1: CatalogEntry[] = [
  // ---- reading a file -------------------------------------------------------------------
  read("ls", "linux", "List what is in a directory"),
  read("cat", "linux", "Show what is in a file"),
  read("head", "linux", "Show the start of a file"),
  read("tail", "linux", "Show the end of a file (also used to follow a log)"),
  read("less", "linux", "Show a file a screen at a time"),
  read("stat", "linux", "Show a file's size, dates and permissions"),
  read("file", "linux", "Work out what kind of file it is"),
  read("find", "linux", "Find files that match"),
  /* An index, when the machine keeps one: the same answer as `find` without walking the disks. */
  read("locate", "linux", "Find files from the index"),
  read("plocate", "linux", "Find files from the index"),
  read("grep", "linux", "Search files or output for text"),
  read("wc", "linux", "Count lines, words and characters"),
  read("diff", "linux", "Show what differs between two files"),
  read("zcat", "linux", "Show what is in a compressed file"),
  read("cut", "linux", "Take just the columns you need from each line"),
  read("sort", "linux", "Sort the lines"),
  read("uniq", "linux", "Collapse repeated lines"),
  read("tr", "linux", "Replace characters"),
  read("strings", "linux", "Show the text inside a binary"),
  read("od", "linux", "Show a file in octal or hex"),
  read("base64", "linux", "Encode or decode base64"),
  read("md5sum", "linux", "Work out a file's MD5 hash"),
  read("sha256sum", "linux", "Work out a file's SHA-256 hash"),
  read("readlink", "linux", "Show where a symbolic link points"),
  read("realpath", "linux", "Show a file's absolute path"),
  read("basename", "linux", "Take the file name out of a path"),
  read("dirname", "linux", "Take the directory out of a path"),
  read("pwd", "linux", "Show the current directory"),
  read("echo", "linux", "Print text as it is"),
  read("which", "linux", "Show where a command actually lives"),
  read("whereis", "linux", "Show where a command and its manual live"),
  read("man", "linux", "Show a command's manual"),
  read("whatis", "linux", "Show a command's one-line description"),
  read("apropos", "linux", "Find a command by its description"),
  read("column", "linux", "Line output up into columns"),

  // ---- load and resources ---------------------------------------------------------------
  read("df", "linux", "Show free space on the disks"),
  read("du", "linux", "Show how much each directory uses"),
  read("free", "linux", "Show how memory is being used"),
  read("uptime", "linux", "Show the uptime and the load average"),
  read("ps", "linux", "List the processes that are running"),
  read("top", "linux", "Show what the processes are costing"),
  read("vmstat", "linux", "Show memory, CPU and I/O statistics"),
  read("iostat", "linux", "Show disk I/O statistics"),
  read("mpstat", "linux", "Show usage per CPU"),
  read("sar", "linux", "Show past performance statistics"),
  read("nproc", "linux", "Show how many CPU cores there are"),
  read("lscpu", "linux", "Show the CPU's details"),
  read("lsmem", "linux", "Show how the memory is made up"),
  read("lsof", "linux", "List the open files and ports"),
  read("lspci", "linux", "List the PCI devices"),
  read("lsusb", "linux", "List the USB devices"),
  read("lsmod", "linux", "List the kernel modules that are loaded"),
  read("modinfo", "linux", "Show a kernel module's details"),
  read("dmidecode", "linux", "Show the hardware's details"),

  // ---- logs ------------------------------------------------------------------------------
  /*
   * `journalctl` carries `--vacuum-size` and friends, which delete. They are long options, not
   * first-argument verbs, so the verb rule cannot see them — but the metacharacter gate means the
   * output cannot be redirected, and vacuuming is loud in the record. Read-parity with the old
   * `logs` set is kept; a stricter operator can write an exception.
   */
  read("journalctl", "linux", "Read systemd's log"),
  read("dmesg", "linux", "Read the kernel's log"),
  read("last", "linux", "Show the sign-in history"),
  read("lastlog", "linux", "Show each user's last sign-in"),
  read("who", "linux", "Show who is signed in now"),
  read("w", "linux", "Show who is signed in and what they are doing"),

  // ---- the OS and the clock ---------------------------------------------------------------
  read("uname", "linux", "Show the kernel and the kind of OS"),
  read("hostname", "both", "Show the host name"),
  read("systemd-detect-virt", "linux", "Work out whether this is a virtual machine"),
  verbs("hostnamectl", "linux", "Show or change the host name and machine details", ["status"]),
  verbs("timedatectl", "linux", "Show or change the time and the time zone", [
    "status", "show", "list-timezones", "timesync-status",
  ]),
  read("date", "linux", "Show the current date and time"),
  read("lsb_release", "linux", "Show the distribution's name and version"),
  read("printenv", "linux", "Show the environment variables"),
  verbs("sysctl", "linux", "Show or change a kernel setting", ["-a", "-n"]),
  read("locale", "linux", "Show the language and region settings"),
  read("getconf", "linux", "Show the system's configuration values"),

  // ---- the network -------------------------------------------------------------------------
  read("ss", "linux", "List the sockets and connections"),
  read("netstat", "both", "List the network connections"),
  read("ping", "both", "Check whether the other end answers"),
  read("dig", "linux", "Look up a name in DNS"),
  read("nslookup", "both", "Look up a name in DNS"),
  read("host", "linux", "Look up a name in DNS"),
  read("traceroute", "linux", "Trace the route to the other end"),
  read("tracepath", "linux", "Trace the route to the other end"),
  read("mtr", "linux", "Measure loss and delay along the route"),
  /* Reads a URL — and can also send one. Only the shapes that read are quiet; parity with the
   * old `network` set. */
  verbs("curl", "linux", "Read a URL (it can also send, so only the reading forms are automatic)", [
    "-I", "-s", "-sS", "-fsS",
  ]),
  write("wget", "linux", "Fetch a file from a URL and save it"),
  /*
   * `ip`, `route`, `arp` were quiet in the old sets, but each changes the machine when given the
   * right words, and the first argument does not tell the halves apart (`ip route` shows,
   * `ip route add` writes). Reading has homes that only read: `ss`, `netstat`, `findmnt`.
   */
  write("ip", "linux", "Show or change the network settings (it can change them, so it is always asked)"),
  write("route", "both", "Show or change the routing table (it can change it, so it is always asked)"),
  write("arp", "both", "Show or change the ARP table (it can change it, so it is always asked)"),
  write("ethtool", "linux", "Show a NIC's state or change its settings (it can change them, so it is always asked)"),
  write("nmcli", "linux", "Show or work NetworkManager (it can change things, so it is always asked)"),
  verbs("resolvectl", "linux", "Show name resolution and set DNS", ["status", "query", "statistics"]),
  verbs("firewall-cmd", "linux", "Show or set firewalld", [
    "--state", "--list-all", "--list-services", "--list-ports", "--list-rich-rules",
    "--get-active-zones", "--get-default-zone", "--get-zones", "--get-services",
  ]),

  // ---- storage ------------------------------------------------------------------------------
  read("lsblk", "linux", "List the disks and partitions"),
  read("findmnt", "linux", "List what is mounted"),
  read("blkid", "linux", "Show a partition's UUID and kind"),
  verbs("smartctl", "linux", "Read a disk's health", ["-i", "-H", "-a", "--scan"]),
  read("lvs", "linux", "List the LVM logical volumes"),
  read("vgs", "linux", "List the LVM volume groups"),
  read("pvs", "linux", "List the LVM physical volumes"),
  write("fsck", "linux", "Check and repair a file system"),

  // ---- services and jobs ---------------------------------------------------------------------
  /* stop / disable / mask are missing on purpose: they are the policy floor's, and the floor
   * refuses to let even an operator's exception make them automatic. */
  verbs("systemctl", "linux", "Work a systemd service", [
    "status", "show", "cat", "is-active", "is-enabled",
    "list-units", "list-unit-files", "list-timers", "list-dependencies", "is-failed",
  ]),
  verbs("service", "linux", "Work a service (the older way)", ["status"]),
  read("systemd-analyze", "linux", "Look at boot times and unit states"),
  verbs("crontab", "linux", "Show or edit the scheduled jobs", ["-l"]),

  // ---- applications --------------------------------------------------------------------------
  verbs("docker", "linux", "Work the containers", [
    "ps", "images", "logs", "inspect", "stats", "top", "port", "history", "version", "info",
  ]),
  verbs("podman", "linux", "Work the containers (podman)", [
    "ps", "images", "logs", "inspect", "stats", "top", "version", "info",
  ]),
  verbs("docker-compose", "linux", "Work a whole compose set of containers", [
    "ps", "logs", "config", "images", "top",
  ]),
  verbs("git", "linux", "Work a repository", [
    "status", "log", "diff", "show", "branch", "remote",
  ]),
  verbs("kubectl", "linux", "Work Kubernetes", [
    "get", "describe", "logs", "top", "explain", "version",
  ]),
  verbs("nginx", "linux", "Check nginx's configuration and control it", ["-t", "-T", "-v", "-V"]),
  /*
   * `-S` and `-V` are how a web server says where it lives.
   *
   * `-V` prints the compiled-in `HTTPD_ROOT` and `SERVER_CONFIG_FILE`, `-S` lists every vhost with
   * the file and line that defined it and its DocumentRoot. On a machine nobody documented, these
   * two answers replace guessing at `/etc/apache2` or `/etc/httpd` — and they are right for a
   * build from source in `/usr/local`, where guessing is wrong by construction.
   *
   * `-D` is deliberately absent: `apachectl -D FOO` passes the define through and *starts* the
   * server. `-S` is the same dump without that edge.
   */
  verbs("apachectl", "linux", "Check Apache's configuration and control it", [
    "configtest", "status", "-t", "-v", "-S", "-V", "-M", "-l",
  ]),
  /* The same program under the name Debian and Ubuntu install it as — the majority of the web. */
  verbs("apache2ctl", "linux", "Check Apache's configuration and control it", [
    "configtest", "status", "-t", "-v", "-S", "-V", "-M", "-l",
  ]),
  /* The binary itself, which RHEL's tooling calls directly. Bare `httpd` starts the server, so
     only the forms that print and exit are automatic. */
  verbs("httpd", "linux", "Check Apache's own configuration", ["-S", "-V", "-M", "-l", "-t", "-v"]),
  read("a2query", "linux", "List Apache's enabled sites and modules"),
  /* `php file.php` and `php -r` run code; `-v` `-i` `--ini` `-m` print and exit. */
  verbs("php", "linux", "Look at PHP's version and settings", ["-v", "--version", "-i", "--ini", "-m", "--modules"]),
  verbs("php-fpm", "linux", "Check PHP-FPM's configuration", ["-t", "-tt", "-v", "-i", "-m"]),
  /* Bare `mysqld` starts the database. `--help` prints the my.cnf search order and exits. */
  verbs("mysqld", "linux", "Ask MySQL itself for its version and where it looks for its settings", ["--version", "-V", "--help"]),
  verbs("mariadbd", "linux", "Ask MariaDB itself for its version and where it looks for its settings", ["--version", "-V", "--help"]),
  /* `postgres -C name` prints one setting and exits; bare `postgres` starts the database. */
  verbs("postgres", "linux", "Ask PostgreSQL itself for its version and one setting", ["--version", "-V", "-C"]),
  verbs("certbot", "linux", "Obtain or renew a TLS certificate", ["certificates"]),

  // ---- packages and updates -----------------------------------------------------------------
  read("dpkg-query", "linux", "Look at the deb packages installed"),
  read("apt-cache", "linux", "Look a package up in apt's index"),
  read("rpmquery", "linux", "Look at the rpm packages installed"),
  read("needs-restarting", "linux", "Find out what needs restarting after an update"),
  verbs("apt", "linux", "Look at and install deb packages", ["list", "show", "search", "policy"]),
  write("apt-get", "linux", "Install, update or remove deb packages"),
  verbs("dpkg", "linux", "Look at and work deb packages", [
    "-l", "-L", "-s", "-S", "--list", "--status",
  ]),
  verbs("dnf", "linux", "Look at and install rpm packages (RHEL family)", [
    "list", "info", "search", "repoquery", "check-update", "history",
  ]),
  verbs("yum", "linux", "Look at and install rpm packages (RHEL family, older)", [
    "list", "info", "search", "check-update", "history",
  ]),
  /* `-qf` names the owner of a path, `-qc` lists a package's config files, `-Va` says which of
     them were changed from what was shipped — the three questions worth asking on a machine
     nobody documented. */
  verbs("rpm", "linux", "Look at and work rpm packages", [
    "-qa", "-qi", "-ql", "-q", "-V", "-qf", "-qc", "-Va",
  ]),
  read("debsums", "linux", "Find which config files differ from what was shipped"),
  verbs("pip3", "linux", "Look at and install Python packages", ["list", "show", "freeze"]),
  verbs("npm", "linux", "Look at and install Node.js packages", ["ls", "view", "outdated"]),
  verbs("snap", "linux", "Look at and install snap packages", ["list", "info"]),
  verbs("flatpak", "linux", "Look at and install flatpak packages", ["list", "info", "search"]),

  // ---- identity, permissions, SELinux (RHEL's own, first-class) -------------------------------
  read("id", "linux", "Show a user's UID, GID and groups"),
  read("whoami", "both", "Show the current user name"),
  read("getent", "linux", "Look a user or group up in the directory"),
  read("groups", "linux", "Show which groups you are in"),
  read("getenforce", "linux", "Show which mode SELinux is in"),
  read("sestatus", "linux", "Show SELinux's state"),
  read("ausearch", "linux", "Search the audit log"),
  read("aureport", "linux", "Show a summary of the audit log"),
  write("semanage", "linux", "Show or change SELinux's settings (it can change them, so it is always asked)"),
  write("restorecon", "linux", "Relabel files for SELinux"),
  verbs("subscription-manager", "linux", "Show or register a Red Hat subscription", [
    "status", "list", "identity", "version",
  ]),

  // ---- writes (confirmed before they run) -----------------------------------------------------
  write("mv", "linux", "Move or rename a file"),
  write("cp", "linux", "Copy a file"),
  write("mkdir", "linux", "Make a directory"),
  write("touch", "linux", "Make an empty file, or update its dates"),
  write("ln", "linux", "Make a link"),
  write("tar", "linux", "Make or unpack an archive"),
  write("gzip", "linux", "Compress a file"),
  write("gunzip", "linux", "Uncompress a file"),
  write("xz", "linux", "Compress or uncompress a file"),
  write("zip", "linux", "Make a zip archive"),
  write("unzip", "linux", "Unpack a zip archive"),
  write("rsync", "linux", "Sync or transfer files"),
  write("scp", "linux", "Transfer files over SSH"),
  write("tee", "linux", "Write the output to a file as well"),
  code("sed", "linux", "Replace text. Not run on the server — use fetch_log then run_local"),
  code("awk", "linux", "Process text. It can run any program, so it is not run on the server"),
  code("gawk", "linux", "awk (GNU). Not run on the server — use run_local"),
  code("mawk", "linux", "awk (mawk). Not run on the server — use run_local"),
  write("useradd", "linux", "Add a user"),
  write("groupadd", "linux", "Add a group"),
  write("openssl", "linux", "The whole certificate and cryptography toolkit (it can generate keys, so it is always asked)"),
  write("logrotate", "linux", "Rotate the logs"),
  write("sync", "linux", "Flush the write buffers to disk"),

  // ---- destructive (always a person; the floor in policy.ts is what enforces it — this is here
  //      to describe them) --------------------------------------------------------------------
  write("rm", "linux", "Delete a file"),
  write("rmdir", "both", "Delete a directory"),
  write("dd", "linux", "Copy data block by block (it can overwrite a device too)"),
  write("mkfs", "linux", "Rebuild a file system (its contents go)"),
  write("fdisk", "linux", "Work the partitions"),
  write("parted", "linux", "Work the partitions"),
  write("shred", "linux", "Delete a file so it cannot be recovered"),
  write("truncate", "linux", "Cut a file down to a given size"),
  write("shutdown", "both", "Halt the machine"),
  write("reboot", "linux", "Restart the machine"),
  write("halt", "linux", "Halt the machine"),
  write("poweroff", "linux", "Power the machine off"),
  write("init", "linux", "Change the run level"),
  write("kill", "linux", "Signal or stop a process"),
  write("pkill", "linux", "Stop a process by name"),
  write("killall", "linux", "Stop processes together, by name"),
  write("chown", "linux", "Change a file's owner"),
  write("chmod", "linux", "Change a file's permissions"),
  write("chgrp", "linux", "Change a file's group"),
  write("mount", "linux", "Mount a file system"),
  write("umount", "linux", "Unmount a file system"),
  write("swapoff", "linux", "Turn swap off"),
  write("swapon", "linux", "Turn swap on"),
  write("userdel", "linux", "Delete a user"),
  write("usermod", "linux", "Change a user's settings"),
  write("passwd", "linux", "Change a password"),
  write("groupdel", "linux", "Delete a group"),
  write("iptables", "linux", "Show or change the packet filter"),
  write("nft", "linux", "Show or change the nftables rules"),
  write("ufw", "linux", "Show or change the firewall"),

  // ---- never run (a shell: it can run anything else) ------------------------------------------
  shell("bash", "linux", "A shell. Allow this and every other limit stops meaning anything"),
  shell("sh", "linux", "A shell. Allow this and every other limit stops meaning anything"),
  shell("zsh", "linux", "A shell. Allow this and every other limit stops meaning anything"),
  shell("dash", "linux", "A shell. Allow this and every other limit stops meaning anything"),
  shell("ksh", "linux", "A shell. Allow this and every other limit stops meaning anything"),
  shell("fish", "linux", "A shell. Allow this and every other limit stops meaning anything"),
  code("python", "linux", "An interpreter. Not run on the server — do the analysis with run_local"),
  code("python3", "linux", "An interpreter. Not run on the server — do the analysis with run_local"),
  code("perl", "linux", "An interpreter. Not run on the server — do the analysis with run_local"),
  code("ruby", "linux", "An interpreter. Not run on the server — do the analysis with run_local"),
  code("node", "linux", "An interpreter. Not run on the server — do the analysis with run_local"),
  code("deno", "linux", "An interpreter. Not run on the server — do the analysis with run_local"),
  code("bun", "linux", "An interpreter. Not run on the server — do the analysis with run_local"),
  shell("ssh", "linux", "It can get into another machine and run anything there"),
  shell("eval", "linux", "It runs whatever string it is given as a command"),
  shell("exec", "linux", "It runs whatever command it is given"),
  code("env", "linux", "It can run whatever command it is given. To see the environment, use printenv"),
  code("xargs", "linux", "It runs the given command with the input as its arguments"),
  shell("nohup", "linux", "It runs the given command so that it survives a disconnection"),
  shell("setsid", "linux", "It runs the given command in another session"),
  shell("timeout", "linux", "It runs the given command with a time limit"),
  shell("watch", "linux", "It runs the given command over and over"),
  shell("su", "linux", "It opens a shell as another user"),
  shell("chroot", "linux", "It swaps the root and runs a command"),
  shell("nc", "linux", "It connects to or listens on any port, and can be used to run commands"),
  shell("ncat", "linux", "It connects to or listens on any port, and can be used to run commands"),
  shell("socat", "linux", "It relays any connection, and can be used to run commands"),
  shell("telnet", "linux", "It connects to any port"),
  shell("screen", "linux", "It keeps a terminal open and can run whatever it is given"),
  shell("tmux", "linux", "It keeps a terminal open and can run whatever it is given"),

  // ---- BusyBox --------------------------------------------------------------------------
  /*
   * On containers and appliances the utilities are BusyBox applets, and a command often arrives
   * as `busybox ls -la` — the first word is `busybox`, and the applet is the first argument.
   * That is exactly the shape the verb rule already handles, so `busybox` is one `verbs` entry
   * and needs no machinery of its own. Applets not named here (including `sh`) stay `write`.
   */
  verbs("busybox", "linux", "The whole BusyBox toolkit — the applet name is the first argument", [
    "ls", "cat", "head", "tail", "grep", "egrep", "fgrep", "find", "stat", "wc", "df", "du",
    "free", "uptime", "ps", "top", "dmesg", "date", "uname", "hostname", "id", "whoami", "who",
    "which", "netstat", "ping", "nslookup", "traceroute", "less", "file", "cut", "sort", "uniq",
    "md5sum", "sha256sum", "readlink", "realpath", "pwd", "dirname", "basename",
  ]),

  // ---- Windows: the cmd family ----------------------------------------------------------------
  read("dir", "windows", "List what is in a directory"),
  read("type", "windows", "Show what is in a file"),
  read("findstr", "windows", "Search files or output for text"),
  read("where", "windows", "Show where a command actually lives"),
  read("tree", "windows", "Show a directory's structure"),
  read("tasklist", "windows", "List the processes that are running"),
  read("systeminfo", "windows", "Show the OS and hardware details"),
  read("ver", "windows", "Show the Windows version"),
  read("ipconfig", "windows", "Show the network settings"),
  read("query", "windows", "Show the state of the sessions and processes"),
  read("driverquery", "windows", "List the drivers"),
  verbs("sc", "windows", "Work a Windows service", ["query", "queryex", "qc", "qdescription"]),
  verbs("net", "windows", "Show or work the shares, sessions and services", ["view"]),
  verbs("wevtutil", "windows", "Read and manage the event log", ["qe", "el", "gli"]),
  /* Lists and deletes under the same name, so nothing of it runs unattended. */
  write("wmic", "windows", "Query and work WMI (it can delete, so it is always asked)"),
  write("taskkill", "windows", "Stop a process"),
  write("del", "windows", "Delete a file"),
  write("erase", "windows", "Delete a file"),
  write("format", "windows", "Format a drive (its contents go)"),
  write("diskpart", "windows", "Work the disks and partitions"),
  write("reg", "windows", "Show or change the registry"),
  write("rd", "windows", "Delete a directory"),
  shell("cmd", "windows", "A shell. Allow this and every other limit stops meaning anything"),
  shell("powershell", "windows", "A shell. Allow this and every other limit stops meaning anything"),
  shell("pwsh", "windows", "A shell. Allow this and every other limit stops meaning anything"),

  // ---- Windows: PowerShell cmdlets (by its verb convention, Get- and Test- read) ---------------
  read("Get-Service", "windows", "List the Windows services and their state"),
  read("Get-Process", "windows", "List the processes that are running"),
  read("Get-WinEvent", "windows", "Read the event log"),
  read("Get-EventLog", "windows", "Read the event log (the older way)"),
  read("Get-ChildItem", "windows", "List what is in a directory"),
  read("Get-Content", "windows", "Show what is in a file"),
  read("Get-Item", "windows", "Show details of a file or a key"),
  read("Get-ItemProperty", "windows", "Show a file's or registry attributes"),
  read("Get-HotFix", "windows", "List the updates already applied"),
  read("Get-Volume", "windows", "List the volumes and their free space"),
  read("Get-Disk", "windows", "List the disks"),
  read("Get-PhysicalDisk", "windows", "List the physical disks and their state"),
  read("Get-NetTCPConnection", "windows", "List the TCP connections"),
  read("Get-NetIPAddress", "windows", "Show the IP address settings"),
  read("Get-NetAdapter", "windows", "List the network adapters"),
  read("Get-ComputerInfo", "windows", "Show the OS and hardware details"),
  read("Get-LocalUser", "windows", "List the local users"),
  read("Get-LocalGroup", "windows", "List the local groups"),
  read("Get-ScheduledTask", "windows", "List the scheduled tasks"),
  read("Get-Counter", "windows", "Read the performance counters"),
  read("Get-PSDrive", "windows", "List the drives and their free space"),
  read("Get-Command", "windows", "List the commands available"),
  read("Get-Help", "windows", "Show a command's description"),
  read("Get-Date", "windows", "Show the current date and time"),
  read("Test-NetConnection", "windows", "Check whether the other end answers and the port is open"),
  read("Test-Path", "windows", "Check whether a file or path is there"),
  read("Measure-Object", "windows", "Count items or add them up"),
  read("Select-String", "windows", "Search files or output for text"),
  write("Restart-Service", "windows", "Restart a Windows service"),
  write("Start-Service", "windows", "Start a Windows service"),
  write("Set-Service", "windows", "Change a Windows service's settings"),
  write("Set-Content", "windows", "Rewrite what is in a file"),
  write("New-Item", "windows", "Make a file or a key"),
  write("Copy-Item", "windows", "Copy a file"),
  write("Move-Item", "windows", "Move or rename a file"),
  write("Set-ItemProperty", "windows", "Change a file's or registry attributes"),
  write("Set-ExecutionPolicy", "windows", "Change the policy for running scripts"),
  write("Invoke-WebRequest", "windows", "Reach a URL and take back the answer"),
  write("Remove-Item", "windows", "Delete a file or a key"),
  write("Stop-Service", "windows", "Stop a Windows service"),
  write("Stop-Process", "windows", "Stop a process"),
  write("Stop-Computer", "windows", "Halt the machine"),
  write("Restart-Computer", "windows", "Restart the machine"),
  write("Format-Volume", "windows", "Format a volume (its contents go)"),
  write("Clear-Content", "windows", "Empty a file"),
  shell("Start-Process", "windows", "It runs whatever program it is given"),
  shell("Invoke-Expression", "windows", "It runs whatever string it is given as a command"),
  shell("Invoke-Command", "windows", "It runs the given script, on another machine too"),
];

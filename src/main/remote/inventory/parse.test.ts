import { describe, expect, it } from "vitest";
import { parseInventory } from "./parse";

/**
 * Real output, captured from real machines.
 *
 * `ss`, `systemctl` and `nft` samples were taken from an AlmaLinux 9 container running actual
 * systemd, and the `cron.d` lines from the Ubuntu test server. Formats vary between versions in
 * exactly the way a hand-written fixture never does — the `systemctl` columns hold `not-found`
 * and `masked` states that a made-up sample would not have thought of, and `list-timers`
 * separates its columns with single spaces in some versions and runs of them in others.
 *
 * The `ufw` and `firewalld` samples are the documented shapes rather than captures: neither runs
 * in a container without dbus. They are marked as such below so nobody reads them as evidence.
 */

const REAL = `#ports
tcp LISTEN 0      5      0.0.0.0:8080 0.0.0.0:* users:(("python3",pid=116,fd=3))
tcp LISTEN 0      128    127.0.0.1:5432 0.0.0.0:* users:(("postgres",pid=201,fd=5))
tcp LISTEN 0      128    [::]:22 [::]:* users:(("sshd",pid=99,fd=4))
udp UNCONN 0      0      0.0.0.0:68 0.0.0.0:*
#services
auditd.service                         not-found inactive dead    auditd.service
console-getty.service                  masked    inactive dead    console-getty.service
dbus-broker.service                    loaded    inactive dead    D-Bus System Message Bus
ldconfig.service                       loaded    active   exited  Rebuild Dynamic Linker Cache
nginx.service                          loaded    failed   failed  A high performance web server
#cron
#comment line
MAILTO=root
0 4 * * * /usr/local/bin/backup.sh --nightly
@reboot /usr/local/bin/warm-cache
#crond
30 3 * * 0 root test -e /run/systemd/system || SERVICE_MODE=1 /usr/libexec/e2fsprogs/e2scrub_all_cron
10 3 * * * root test -e /run/systemd/system || SERVICE_MODE=1 /sbin/e2scrub_all -A -r
#timers
Mon 2026-08-10 15:16:32 UTC 14min left - - systemd-tmpfiles-clean.timer systemd-tmpfiles-clean.service
Mon 2026-08-10 16:00:34 UTC 58min left - - dnf-makecache.timer          dnf-makecache.service
#containers
9f2c1a\timachina/web:1.4\tweb\tUp 3 days\t0.0.0.0:443->443/tcp
3b71ff\tpostgres:16\tdb\tExited (0) 2 hours ago\t
#images
machina/web\t1.4\t184MB
postgres\t16\t432MB
#firewall
table inet filter {
	chain input {
		type filter hook input priority filter; policy drop;
		tcp dport 22 accept
	}
}
#updates
acl.aarch64                              2.4.0-1.el9_8                    baseos
coreutils-single.aarch64                 8.32-41.el9_8                    baseos
#reboot
yes
#end
`;

describe("what the server is running", () => {
  const inventory = parseInventory(REAL)!;

  it("the ports open to the outside come first", () => {
    /*
     * The single most useful fact here. `127.0.0.1:5432` and `0.0.0.0:5432` differ by four
     * characters and by whether the internet can talk to the database.
     */
    expect(inventory.ports.map((each) => `${each.address}:${each.port}`)).toEqual([
      "[::]:22",
      "0.0.0.0:68",
      "0.0.0.0:8080",
      "127.0.0.1:5432",
    ]);
    expect(inventory.ports.filter((each) => each.exposed)).toHaveLength(3);
    expect(inventory.ports.find((each) => each.port === 5432)?.exposed).toBe(false);
    expect(inventory.ports.find((each) => each.port === 22)?.process).toBe("sshd");
  });

  it("a broken service goes to the top", () => {
    // A list of two hundred units in alphabetical order buries the one that is broken.
    expect(inventory.services[0]).toMatchObject({ name: "nginx.service", active: "failed" });
    expect(inventory.services[1].active).toBe("active");
    expect(inventory.services.find((each) => each.name === "auditd.service")?.load).toBe(
      "not-found",
    );
  });

  it("both cron and systemd timers are listed", () => {
    const commands = inventory.cron.map((each) => each.command);
    expect(commands).toContain("/usr/local/bin/backup.sh --nightly");
    expect(commands).toContain("/usr/local/bin/warm-cache");
    expect(commands).toContain("systemd-tmpfiles-clean.timer");
    // Comments and `MAILTO=` are not jobs.
    expect(commands.some((each) => each.includes("MAILTO"))).toBe(false);
  });

  it("the user column in /etc/cron.d is not mistaken for the command", () => {
    const entry = inventory.cron.find((each) => each.schedule === "10 3 * * *");
    expect(entry?.owner).toBe("system");
    // `root` is who runs it, not the first word of what runs.
    expect(entry?.command.startsWith("test -e")).toBe(true);
  });

  it("a timer's next time is picked out", () => {
    const timer = inventory.cron.find((each) => each.command === "dnf-makecache.timer");
    expect(timer?.schedule).toBe("Mon 2026-08-10 16:00:34 UTC 58min left");
  });

  it("a stopped container is listed too", () => {
    expect(inventory.containers).toHaveLength(2);
    expect(inventory.containers[1]).toMatchObject({ name: "db", status: "Exited (0) 2 hours ago" });
    expect(inventory.images[0]).toMatchObject({ repository: "machina/web", tag: "1.4" });
  });

  it("it reads nftables", () => {
    expect(inventory.firewall).toMatchObject({ kind: "nftables", active: true });
    expect(inventory.firewall.rules.some((each) => each.includes("tcp dport 22 accept"))).toBe(
      true,
    );
  });

  it("how many updates, and whether a restart is needed", () => {
    expect(inventory.updates).toMatchObject({ count: 2, rebootRequired: true });
  });
});

describe("telling one firewall from another", () => {
  const firewallOf = (text: string) => parseInventory(`#firewall\n${text}\n`)!.firewall;

  it("iptables letting everything through is there but doing nothing, and says so", () => {
    // Captured from AlmaLinux 9: a default-accept policy with no rules at all.
    const parsed = firewallOf("-P INPUT ACCEPT\n-P FORWARD ACCEPT\n-P OUTPUT ACCEPT");
    expect(parsed).toMatchObject({ kind: "iptables", active: false });
  });

  it("iptables with rules in it is in effect", () => {
    const parsed = firewallOf("-P INPUT DROP\n-A INPUT -p tcp --dport 22 -j ACCEPT");
    expect(parsed).toMatchObject({ kind: "iptables", active: true });
  });

  /* Documented shape, not a capture: ufw is Debian's and firewalld needs dbus. */
  it("it reads ufw's state", () => {
    expect(firewallOf("Status: active\nTo    Action  From\n22/tcp  ALLOW  Anywhere")).toMatchObject(
      { kind: "ufw", active: true },
    );
    expect(firewallOf("Status: inactive")).toMatchObject({ kind: "ufw", active: false });
  });

  it("when nothing is found, it says so", () => {
    /* With `#end` it was read to the end, so empty can be said to mean empty. */
    const inventory = parseInventory("#firewall\n#end\n")!;
    expect(inventory.firewall.kind).toBe("none");
    expect(inventory.missing.some((each) => each.includes("firewall"))).toBe(true);
  });
});

describe("when it cannot be read", () => {
  it("anything that is not Linux comes back with nothing", () => {
    expect(parseInventory("'ss' is not recognized")).toBeUndefined();
  });

  it("without systemd, what could be read still comes back", () => {
    const inventory = parseInventory(
      "#ports\ntcp LISTEN 0 5 0.0.0.0:80 0.0.0.0:*\n#services\n#end\n",
    )!;
    expect(inventory.ports).toHaveLength(1);
    expect(inventory.services).toEqual([]);
    expect(inventory.missing.some((each) => each.includes("systemd"))).toBe(true);
  });
});

/**
 * A reading that stopped half way.
 *
 * This is the failure that used to be invisible: the tail of a long answer was dropped by the
 * runner's cap, and "the firewall section never arrived" was read as "this machine has no
 * firewall" — a sentence the operator would act on. Both signals are checked, because neither
 * catches the other's case.
 */
describe("a reading that was cut short", () => {
  const CUT = `#ports
tcp LISTEN 0      128    0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=99,fd=4))
#services
nginx.service                          loaded    active   running A high performance web server
#firew`;

  it("without the marker at the end, it says it was cut", () => {
    const inventory = parseInventory(CUT)!;
    expect(inventory.missing[0]).toContain("stopped part way");
  });

  it("cut short, it does not say there is no firewall", () => {
    const inventory = parseInventory(CUT)!;
    expect(inventory.firewall.kind).toBe("none");
    expect(inventory.missing.some((each) => each.includes("firewall"))).toBe(false);
  });

  it("stopped at the limit, it says so independently of the marker", () => {
    // A timed-out partial output has no marker; one cut at the limit sometimes does. Watch both.
    const inventory = parseInventory(`${CUT}\n#firewall\n#end\n`, { truncated: true })!;
    expect(inventory.missing[0]).toContain("stopped part way");
  });

  it("read to the end, it says nothing about it", () => {
    const inventory = parseInventory(REAL)!;
    expect(inventory.missing.some((each) => each.includes("stopped part way"))).toBe(false);
  });
});

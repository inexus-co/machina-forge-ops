import { describe, expect, it } from "vitest";
import { cpuBusy, parseStatus } from "./parse";

/**
 * Real output, not invented output.
 *
 * The samples below were taken from the test container. `/proc` formats vary between kernels and
 * `df` varies between coreutils versions, which is exactly the kind of thing that looks fine in a
 * hand-written fixture and breaks against a real machine.
 */

const OUTPUT = `#os
Linux 6.17.4-orbstack-00435-gb3d38f3daa4c aarch64
eefb24a473a9
PRETTY_NAME="Ubuntu 26.04 LTS"
NAME="Ubuntu"
VERSION_ID="26.04"
#cpu
processor	: 0
BogoMIPS	: 48.00
Features	: fp asimd
model name	: Neoverse-N1
processor	: 1
BogoMIPS	: 48.00
model name	: Neoverse-N1
#stat
cpu  240 0 180 96000 40 0 12 0 0 0
cpu0 120 0 90 48000 20 0 6 0 0 0
intr 12345
#mem
MemTotal:        8039208 kB
MemFree:          204800 kB
MemAvailable:    6291456 kB
Buffers:           20480 kB
Cached:          5242880 kB
SwapTotal:       1048576 kB
SwapFree:         524288 kB
#load
0.52 0.31 0.18 2/312 4096
86400.00 340000.00
#df
Filesystem     1024-blocks     Used Available Capacity Mounted on
overlay          955101696 39321600 915780096       5% /
tmpfs                65536        0     65536       0% /dev
shm                  65536        0     65536       0% /dev/shm
/dev/vda1        955101696 39321600 915780096       5% /etc/hosts
tmpfs                 4096        0      4096       0% /proc/scsi
`;

describe("reading a server's state", () => {
  const parsed = parseStatus(OUTPUT);

  it("it reads what the machine is", () => {
    expect(parsed?.status).toMatchObject({
      hostname: "eefb24a473a9",
      os: "Ubuntu 26.04 LTS",
      kernel: "6.17.4-orbstack-00435-gb3d38f3daa4c",
      architecture: "aarch64",
      cpuModel: "Neoverse-N1",
      cpuCores: 2,
    });
  });

  it("it reports what is used, not what is free", () => {
    /*
     * The number that matters is total minus MemAvailable, not MemFree. On a healthy Linux box
     * MemFree is nearly zero because the kernel caches with everything spare, and reporting that
     * as "used" is how a status panel frightens somebody about a machine that is fine.
     */
    expect(parsed?.status.memory).toEqual({
      total: 8039208 * 1024,
      used: (8039208 - 6291456) * 1024,
      swapTotal: 1048576 * 1024,
      swapUsed: 524288 * 1024,
    });
  });

  it("only the real disks are listed; the pseudo file systems are dropped", () => {
    /*
     * `/` is an overlay on every container. Filtering by device name looked reasonable and threw
     * away the one line this panel exists to show, so the filter is on the mount point.
     */
    const mounts = parsed?.status.filesystems.map((each) => each.mount);
    expect(mounts).toEqual(["/"]);
    expect(parsed?.status.filesystems[0]).toMatchObject({
      device: "overlay",
      total: 955101696 * 1024,
      used: 39321600 * 1024,
    });
  });

  it("the load average and the uptime", () => {
    expect(parsed?.status.load).toEqual([0.52, 0.31, 0.18]);
    expect(parsed?.status.uptimeSeconds).toBe(86400);
  });

  /*
   * Taken from the aarch64 container. `model name` is x86's field and does not exist here;
   * `lscpu` has `Model name: -` and `Model: 0`, and reading the latter as the processor's name
   * put "0 × 18" on screen.
   */
  it("ARM: with no name there, a number is not read as one", () => {
    const arm = parseStatus(`#cpu
processor	: 0
CPU implementer	: 0x61
CPU part	: 0x000
processor	: 1
Architecture:      aarch64
CPU(s):            18
Vendor ID:         Apple
Model name:        -
Model:             0
#df
`);
    expect(arm?.status.cpuModel).toBe("Apple");
    expect(arm?.status.cpuCores).toBe(2);
  });

  it("x86: the model name in cpuinfo is used as it stands", () => {
    const x86 = parseStatus(`#cpu
processor	: 0
model name	: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz
#df
`);
    expect(x86?.status.cpuModel).toBe("Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz");
  });

  it("anything that is not Linux comes back with nothing", () => {
    expect(parseStatus("'uname' is not recognized as an internal or external command")).toBeUndefined();
  });

  it("what could be read comes back, even when some of it could not", () => {
    const partial = parseStatus("#os\nLinux 6.1 x86_64\nweb01\n#df\n");
    expect(partial?.status.hostname).toBe("web01");
    expect(partial?.status.memory).toBeUndefined();
    expect(partial?.status.filesystems).toEqual([]);
  });
});

describe("how busy the CPU is", () => {
  /*
   * One reading says how long the machine has been busy *since it booted*. On a server up for a
   * year that number never visibly moves, so the rate is the difference between two readings.
   */
  it("it comes from the difference between two readings", () => {
    // 100 ticks passed, 25 of them idle.
    expect(cpuBusy({ total: 1000, idle: 800 }, { total: 1100, idle: 825 })).toBe(75);
  });

  it("nothing running is zero", () => {
    expect(cpuBusy({ total: 1000, idle: 800 }, { total: 1100, idle: 900 })).toBe(0);
  });

  it("a counter that went backwards is no answer: the machine restarted", () => {
    expect(cpuBusy({ total: 1000, idle: 800 }, { total: 500, idle: 400 })).toBeUndefined();
    expect(cpuBusy({ total: 1000, idle: 800 }, { total: 1100, idle: 700 })).toBeUndefined();
  });

  it("reading the same moment twice does not break it", () => {
    expect(cpuBusy({ total: 1000, idle: 800 }, { total: 1000, idle: 800 })).toBeUndefined();
  });
});

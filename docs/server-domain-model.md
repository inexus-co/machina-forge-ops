# A domain model for server maintenance, v0

Status: a draft, written before the implementation. It is corrected as the implementation lands,
and deleted once it can no longer be corrected.

## What this is

A way of naming which area of a server a piece of work belongs to. It is meant as a table of
contents for modelling those areas one by one. It is the classification only; there is no
implementation in it.

## What it assumes

The main work is updating and deploying applications on a server. Investigating a fault comes
second. The depth is uneven: `application` is the thickest area by far.

The lower an area sits — hardware, firmware — the less of it there is to touch, and the more so
the more virtualised or cloud-hosted the customer's server is. The names stay, but for now they
are only ways of classifying an observation.

## Two models, kept apart

|  | Facts (the state) | Observations (a judgement) |
| --- | --- | --- |
| What is in it | The digest of the running image, the mounts, the listening ports | "443 is stuck on name resolution", with what it rests on and how sure it is |
| What it is like | Enumerable. The same shape on every server | Different for every symptom. Not enumerable |
| One per area? | **Yes. That is what modelling an area means** | **No. One shape across every area** |

Splitting the observation schema by area leaves nowhere to put an observation that crosses two of
them ("the disk filled up and authentication fell over"). One shape with a `category` is enough.

---

## The areas

The `slug` is the identifier. There are no numbers — they shift every time one is added.

### Layers

| slug | What it covers | Depth |
| --- | --- | --- |
| `hardware` | The CPU, memory and disks themselves, SMART, RAID, temperature, power | name only |
| `firmware-boot` | BIOS/UEFI, the boot loader, boot order, Secure Boot | name only |
| `kernel` | The kernel version, modules, `dmesg`, sysctl | name only |
| `os` | The distribution and its version, the hostname, locale, init as a whole | name only |
| `time` | NTP/chrony/w32time, drift, the timezone | shallow |
| `resource` | CPU, memory, load, swap, OOM, IO wait | shallow |
| `network` | Addresses, routes, DNS, what is listening, reachability, the firewall | middling |
| `storage` | Capacity, inodes, mounts, LVM, IO | middling |
| `identity` | Users and groups, sudo, SSH keys, AD/LDAP | name only |
| `packages` | apt/yum/winget, what can be updated, what is held, the repositories | shallow |
| `services` | systemd units, Windows services, cron, timers, scheduled tasks | middling |
| `application` | The applications running, their versions, configuration, health and dependencies. Images, containers and compose live here | **deep** |
| `security` | SELinux/AppArmor, firewall policy, certificates and their expiry, auditing, licences | shallow |
| `access` | SSH/RDP/IPMI/console, jump servers, keys. **Our own way in** | shallow |
| `platform` | VM, cloud or hypervisor, CPU steal, snapshots, the instance type | shallow |

Three were added to the original twelve (`time`, `resource`, `platform`), because:

- **`time`** — drift breaks authentication (Kerberos), certificates and lining up logs, all at
  once. Buried inside `os`, nobody goes and looks at it.
- **`resource`** — CPU, memory, swap and OOM were in none of the original areas, and a good half
  of what anyone is asked about starts with "it is slow".
- **`platform`** — VM or cloud. CPU steal, and congestion on the host side, are not `hardware`.

Containers are not an area of their own. An image and a compose file are **how an application is
wrapped and run**, which makes them part of `application`. A shelf labelled with a product name
like Docker leaves podman, systemd-nspawn, and any application not in a container, with nowhere to
go.

### Across all of them

| slug | What it covers |
| --- | --- |
| `change` | What changed and when. Built from the difference between facts, and from an outside deployment history |

**Logs and observability are not an area.** journald, the event log and a container's log are
sources of evidence that every area uses, not a shelf to line up beside the others. They belong in
an observation's `evidence`.

---

## What the classification is for

1. **Classifying an observation** — which area what was found belongs to (`category`)
2. **A unit for organising skills and the commands that collect** — each area settles a set of
   read-only commands, and that set is exactly the allowlist an agent investigating that area may
   be given
3. **A line to draw when building the types for facts** — an "enumerable state" type per area, but
   never all of them at once: in the order the areas turn out to be used

The types for facts themselves are written separately, for whichever area needs one. This document
goes as far as the classification.

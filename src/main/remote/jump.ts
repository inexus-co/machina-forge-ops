import net from "node:net";
import { t } from "../../shared/i18n";
import type { Duplex } from "node:stream";
import { Client } from "ssh2";
import { type SshTarget, connectionOf, describe } from "./sshSession";

/**
 * Reaching a server through another one.
 *
 * Customers' machines are usually not on a route from here. There is a bastion — one host that
 * accepts connections from outside — and everything else is reached from it. Without this the
 * application can only talk to servers that happen to be directly addressable, which is a
 * category that excludes most of the ones worth maintaining.
 *
 * The bastion is **another registered server**, not a second credential form. Its password or key
 * is stored the same way, its host key is verified the same way, and the operator can open a
 * terminal on it like anything else. A separate "jump host" configuration would have been a
 * second copy of all of that, kept in step by hand.
 *
 * Two shapes are needed, because the two protocols ask differently:
 *
 * - **A channel** for SSH. `ssh2` takes any duplex stream as its socket, so a direct-tcpip
 *   channel opened on the bastion is exactly what it wants.
 * - **A local port** for RDP. The helper is a separate process that opens its own socket, so
 *   there has to be something on this machine for it to connect to.
 */

/** How long to wait for the bastion itself. The same patience as any other connection. */
const READY_TIMEOUT_MS = 20_000;

export class JumpConnection {
  private client?: Client;
  private servers = new Map<string, net.Server>();

  constructor(private readonly bastion: () => Promise<SshTarget>) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    const target = await this.bastion();
    const client = new Client();
    await new Promise<void>((resolve, reject) => {
      client.on("ready", () => resolve());
      client.on("error", (cause: Error) => reject(new Error(t("Jump server: {reason}", { reason: describe(cause) }))));
      client.connect({ ...connectionOf(target), readyTimeout: READY_TIMEOUT_MS });
    });
    client.on("close", () => {
      if (this.client === client) this.client = undefined;
    });
    this.client = client;
    return client;
  }

  /** A stream to `host:port`, opened from the bastion. What `ssh2` wants as its `sock`. */
  async channel(host: string, port: number): Promise<Duplex> {
    const client = await this.connect();
    return await new Promise<Duplex>((resolve, reject) => {
      // The source address is only a label in the protocol; the bastion does not connect back.
      client.forwardOut("127.0.0.1", 0, host, port, (error, stream) => {
        if (error) reject(new Error(
          t("The jump server cannot reach {where}: {reason}", {
            where: `${host}:${port}`,
            reason: error.message,
          }),
        ));
        else resolve(stream);
      });
    });
  }

  /**
   * A port on this machine that leads to `host:port` through the bastion.
   *
   * Bound to the loopback address only. A forward that listened on every interface would put a
   * customer's internal server on this laptop's network for as long as the window was open.
   */
  async listen(host: string, port: number): Promise<number> {
    const label = `${host}:${port}`;
    const existing = this.servers.get(label);
    if (existing) return (existing.address() as net.AddressInfo).port;

    const client = await this.connect();
    const server = net.createServer((socket) => {
      client.forwardOut("127.0.0.1", 0, host, port, (error, stream) => {
        if (error) {
          socket.destroy();
          return;
        }
        socket.pipe(stream).pipe(socket);
        // Either end closing takes the other with it; a half-open pair leaks a channel.
        stream.on("close", () => socket.destroy());
        socket.on("error", () => stream.destroy());
      });
    });

    const local = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () =>
        resolve((server.address() as net.AddressInfo).port),
      );
    });
    this.servers.set(label, server);
    return local;
  }

  stop() {
    for (const server of this.servers.values()) server.close();
    this.servers.clear();
    this.client?.end();
    this.client = undefined;
  }
}

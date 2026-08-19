import { useEffect, useState } from "react";
import { useT } from "../i18n";
import type { RemoteHostInput, RemoteHostState, SshAuth } from "../../../shared/remote";
import { DEFAULT_RDP_PORT, DEFAULT_SSH_PORT, DEFAULT_VNC_PORT } from "../../../shared/remote";
import { SwapLabel } from "./SwapLabel";
import { Toast } from "./Toast";

/**
 * One server's addresses.
 *
 * RDP and SSH are separate blocks with their own switch, because a Linux box with no desktop has
 * only one of them and an appliance may have only the other. Turning a block off keeps what was
 * typed — it says "not this machine", not "throw that away".
 *
 * Passwords are write-only. The value never comes back from the main process, so the field starts
 * empty on every visit and an empty one on save means "keep the stored one".
 */

const STORED_MASK = "············";

type Draft = {
  name: string;
  useRdp: boolean;
  rdpHost: string;
  rdpPort: number;
  rdpUser: string;
  rdpPassword: string;
  useVnc: boolean;
  vncHost: string;
  vncPort: number;
  vncUser: string;
  vncPassword: string;
  vncAllowPlaintext: boolean;
  useSsh: boolean;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshAuth: SshAuth;
  sshPassword: string;
  sshKeyPath: string;
  sshPassphrase: string;
  sshTmux: boolean;
  sshKeepLocal: boolean;
  jumpHostId: string;
};

function draftOf(host?: RemoteHostState): Draft {
  return {
    name: host?.name ?? "",
    useRdp: Boolean(host?.rdp),
    rdpHost: host?.rdp?.host ?? "",
    rdpPort: host?.rdp?.port ?? DEFAULT_RDP_PORT,
    rdpUser: host?.rdp?.username ?? "",
    rdpPassword: "",
    useVnc: Boolean(host?.vnc),
    vncHost: host?.vnc?.host ?? "",
    vncPort: host?.vnc?.port ?? DEFAULT_VNC_PORT,
    vncUser: host?.vnc?.username ?? "",
    vncPassword: "",
    vncAllowPlaintext: host?.vnc?.allowPlaintext ?? false,
    useSsh: Boolean(host?.ssh),
    sshHost: host?.ssh?.host ?? "",
    sshPort: host?.ssh?.port ?? DEFAULT_SSH_PORT,
    sshUser: host?.ssh?.username ?? "",
    sshAuth: host?.ssh?.auth ?? "password",
    sshPassword: "",
    sshKeyPath: host?.ssh?.keyPath ?? "",
    sshPassphrase: "",
    sshTmux: host?.ssh?.tmux ?? false,
    sshKeepLocal: host?.ssh?.keepLocal ?? false,
    jumpHostId: host?.jumpHostId ?? "",
  };
}

export function HostForm({
  busy,
  host,
  hosts,
  onAddHost,
  onCancel,
  onRemove,
  onSave,
}: {
  host?: RemoteHostState;
  /** Start adding another server — offered when there is nothing to pick as a bastion. */
  onAddHost?: () => void;
  /** The other registered servers, one of which may be this one's way in. */
  hosts: RemoteHostState[];
  busy: boolean;
  onSave: (input: RemoteHostInput) => void;
  onRemove: (id: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<Draft>(() => draftOf(host));
  /**
   * Which part of this server's settings is on screen.
   *
   * Categories rather than one long page: the address is filled in once and the rest is looked
   * at when something is wrong with it. Every field's value lives in `draft` above, so switching
   * away from a category and back does not lose what was typed into it.
   */
  const [tab, setTab] = useState<"connection" | "auth" | "route" | "terminal">("connection");
  /** The servers that could be this one's way in: any other with SSH. */
  const candidates = hosts.filter((each) => each.id !== host?.id && each.ssh);
  /** Whether this machine can keep terminals. Without tmux here, nothing is kept. */
  const [localTmux, setLocalTmux] = useState<string>();

  useEffect(() => {
    void window.machina.remote
      .localTmux()
      .then(setLocalTmux)
      .catch(() => undefined);
  }, []);
  const [touchedRdp, setTouchedRdp] = useState(false);
  const [touchedVnc, setTouchedVnc] = useState(false);
  const [touchedSsh, setTouchedSsh] = useState(false);

  useEffect(() => {
    setDraft(draftOf(host));
    setTouchedRdp(false);
    setTouchedVnc(false);
    setTouchedSsh(false);
  }, [host?.id]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  /**
   * Why saving would not work, said only when it is asked for.
   *
   * The button used to be greyed out until the form was complete. With placeholders that look
   * like values — `192.168.10.5`, `3389` — an empty form reads as a filled one, and a dead
   * button reads as a broken application. It is pressable now, and this is the answer.
   */
  /* Shown as a toast, not as a line that appears between the fields and moves them. */
  const [problem, setProblem] = useState<string>();

  const missing = () => {
    if (!draft.useRdp && !draft.useVnc && !draft.useSsh)
      return t("Turn on a screen (RDP or VNC) or SSH.");
    if (draft.useRdp && !draft.rdpHost.trim()) return t("Enter the RDP host.");
    if (draft.useVnc && !draft.vncHost.trim()) return t("Enter the VNC host.");
    if (draft.useSsh && !draft.sshHost.trim()) return t("Enter the SSH host.");
    // A key connection with no key would fail at connect time with a message about
    // authentication, which is the wrong thing to make somebody debug.
    if (draft.useSsh && draft.sshAuth === "key" && !draft.sshKeyPath.trim()) {
      return t("Choose where the private key is.");
    }
    return undefined;
  };

  const showStoredRdp = Boolean(host?.rdp?.hasPassword) && !touchedRdp && !draft.rdpPassword;
  const showStoredVnc = Boolean(host?.vnc?.hasPassword) && !touchedVnc && !draft.vncPassword;
  const showStoredSsh = Boolean(host?.ssh?.hasPassword) && !touchedSsh && !draft.sshPassword;

  return (
    <div className="settings-page host-settings">
      {/* No name here: the dialog's own header says which server this is. */}
      <nav aria-label={t("This server's settings")} className="settings-nav host-nav">
        {[
          { id: "connection" as const, label: t("Connection"), note: t("Address and account") },
          { id: "auth" as const, label: t("Sign-in"), note: t("Password or private key") },
          { id: "route" as const, label: t("Route"), note: t("Jump server") },
          { id: "terminal" as const, label: t("Session"), note: t("tmux and keeping it open") },
        ].map((item) => (
          <button
            className={tab === item.id ? "active" : undefined}
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.note}</small>
          </button>
        ))}
      </nav>

      <section className="form-section">
        {tab === "connection" && (
        <>

        <div className="connection-fields">
          <label>
            {t("Name")}
            <input
              placeholder={t("Customer A, main server")}
              value={draft.name}
              onChange={(event) => set("name", event.target.value)}
            />
          </label>
        </div>

        <h4>
          <label className="inline-check">
            <input
              checked={draft.useRdp}
              type="checkbox"
              onChange={(event) => set("useRdp", event.target.checked)}
            />
            {t("RDP (screen)")}
          </label>
        </h4>
        {/* Always rendered, disabled when the protocol is off: a block that appears and vanishes
            moves everything below it the moment a checkbox is touched. */}
        <div className="connection-fields">
          <label>
            {t("Host")}
            <input
              disabled={!draft.useRdp}
              placeholder="192.168.10.5"
              spellCheck={false}
              value={draft.rdpHost}
              onChange={(event) => set("rdpHost", event.target.value)}
            />
          </label>
          <label>
            {t("Port")}
            <input
              disabled={!draft.useRdp}
              max={65535}
              min={1}
              type="number"
              value={draft.rdpPort}
              onChange={(event) => set("rdpPort", Number(event.target.value))}
            />
          </label>
          <label>
            {t("User")}
            <input
              disabled={!draft.useRdp}
              placeholder="Administrator"
              spellCheck={false}
              value={draft.rdpUser}
              onChange={(event) => set("rdpUser", event.target.value)}
            />
          </label>
        </div>
        <div className="token-row">
          <label>
            {t("Password")}
            <input
              autoComplete="off"
              disabled={!draft.useRdp}
              placeholder={t("RDP password")}
              type="password"
              value={showStoredRdp ? STORED_MASK : draft.rdpPassword}
              onFocus={() => setTouchedRdp(true)}
              onChange={(event) => {
                setTouchedRdp(true);
                set("rdpPassword", event.target.value);
              }}
            />
          </label>
        </div>

        <h4>
          <label className="inline-check">
            <input
              checked={draft.useVnc}
              type="checkbox"
              onChange={(event) => set("useVnc", event.target.checked)}
            />
            {t("VNC (screen)")}
          </label>
        </h4>
        {/* The other screen, for servers that speak RFB. */}
        <div className="connection-fields">
          <label>
            {t("Host")}
            <input
              disabled={!draft.useVnc}
              placeholder="192.168.10.5"
              spellCheck={false}
              value={draft.vncHost}
              onChange={(event) => set("vncHost", event.target.value)}
            />
          </label>
          <label>
            {t("Port")}
            <input
              disabled={!draft.useVnc}
              max={65535}
              min={1}
              type="number"
              value={draft.vncPort}
              onChange={(event) => set("vncPort", Number(event.target.value))}
            />
          </label>
          <label>
            {t("User (only if needed)")}
            <input
              disabled={!draft.useVnc}
              placeholder={t("Usually left empty")}
              spellCheck={false}
              value={draft.vncUser}
              onChange={(event) => set("vncUser", event.target.value)}
            />
          </label>
        </div>
        <div className="token-row">
          <label>
            {t("Password")}
            <input
              autoComplete="off"
              disabled={!draft.useVnc}
              placeholder={t("VNC password")}
              type="password"
              value={showStoredVnc ? STORED_MASK : draft.vncPassword}
              onFocus={() => setTouchedVnc(true)}
              onChange={(event) => {
                setTouchedVnc(true);
                set("vncPassword", event.target.value);
              }}
            />
          </label>
        </div>
        {/* Said once, where the empty field is: the usual VNC has no account, and the servers
            that do are the ones worth naming. */}
        <p className="form-hint">
          {t("Ordinary VNC takes a password and no user name. Fill this in only for the servers that use one — TigerVNC, macOS screen sharing, UltraVNC.")}
        </p>
        {/*
          The one decision this screen cannot make for the operator.

          Some servers will only take the password as plain text (VeNCrypt's `Plain`). Inside an
          SSH tunnel or a VPN that is fine; across the open network it is not, and nothing here can
          tell which this is. So it is asked, once, per server — and left off.
        */}
        <label className="inline-check">
          <input
            checked={draft.vncAllowPlaintext}
            disabled={!draft.useVnc}
            type="checkbox"
            onChange={(event) => set("vncAllowPlaintext", event.target.checked)}
          />
          {t("Allow the password to be sent in the clear")}
        </label>
        <p className="form-hint settings-danger-note">
          {t("Only needed for VNC servers that cannot encrypt. With this on, this server's password crosses the network as it is. Allow it only inside a jump server or a VPN.")}
        </p>

        <h4>
          <label className="inline-check">
            <input
              checked={draft.useSsh}
              type="checkbox"
              onChange={(event) => set("useSsh", event.target.checked)}
            />
            {t("SSH (session)")}
          </label>
        </h4>
        <div className="connection-fields">
          <label>
            {t("Host")}
            <input
              disabled={!draft.useSsh}
              placeholder="192.168.10.5"
              spellCheck={false}
              value={draft.sshHost}
              onChange={(event) => set("sshHost", event.target.value)}
            />
          </label>
          <label>
            {t("Port")}
            <input
              disabled={!draft.useSsh}
              max={65535}
              min={1}
              type="number"
              value={draft.sshPort}
              onChange={(event) => set("sshPort", Number(event.target.value))}
            />
          </label>
          <label>
            {t("User")}
            <input
              disabled={!draft.useSsh}
              placeholder="root"
              spellCheck={false}
              value={draft.sshUser}
              onChange={(event) => set("sshUser", event.target.value)}
            />
          </label>
        </div>
        </>
        )}

        {tab === "terminal" && (
        <>
        {/*
          What tmux buys is the thing SSH cannot: the work outlives the connection.
        *
          Off by default and per server — wrapping somebody's shell in tmux unasked changes their
          keys and their scrollback, and on a machine that already starts tmux it would be a
          second layer.
        */}
        <label className="inline-check">
          <input
            checked={draft.sshTmux}
            disabled={!draft.useSsh}
            type="checkbox"
            onChange={(event) => set("sshTmux", event.target.checked)}
          />
          {t("Open inside tmux on the server (what is running there survives a dropped line)")}
        </label>

        {/*
          The other half, and a different loss.
        *
          Server-side tmux survives the network going away. This survives *Forge* going away —
          the terminal runs inside a tmux session on this machine, so a crash of the window is
          not a crash of the work. Neither covers the other, which is why they are two lines.
        */}
        <label className="inline-check">
          <input
            checked={draft.sshKeepLocal}
            disabled={!draft.useSsh || !localTmux}
            type="checkbox"
            onChange={(event) => set("sshKeepLocal", event.target.checked)}
          />
          {t("Keep it on this machine (the session survives Forge closing)")}
          {localTmux ? (
            <span className="form-aside">{localTmux}</span>
          ) : (
            <span className="form-aside">{t("Unavailable: this machine has no tmux")}</span>
          )}
        </label>

        </>
        )}

        {tab === "auth" && (
        <>
        {/* Both fields would be misleading: only one of them is used, and the unused one
            still looks like something that has to be filled in. */}
        <div className="auth-choice">
          {(["password", "key"] as SshAuth[]).map((each) => (
            <button
              className={draft.sshAuth === each ? "active" : undefined}
              disabled={!draft.useSsh}
              key={each}
              type="button"
              onClick={() => set("sshAuth", each)}
            >
              {each === "password" ? t("Password") : t("Private key")}
            </button>
          ))}
        </div>

        {draft.sshAuth === "password" ? (
          <div className="token-row">
            <label>
              {t("Password")}
              <input
                autoComplete="off"
                disabled={!draft.useSsh}
                placeholder={t("SSH password")}
                type="password"
                value={showStoredSsh ? STORED_MASK : draft.sshPassword}
                onFocus={() => setTouchedSsh(true)}
                onChange={(event) => {
                  setTouchedSsh(true);
                  set("sshPassword", event.target.value);
                }}
              />
            </label>
          </div>
        ) : (
          <>
            <div className="key-row">
              <label>
                {t("Private key")}
                {/* Typeable as well as pickable: a path that is already on the clipboard, or
                    one somebody knows by heart, should not need a file dialog. */}
                <input
                  disabled={!draft.useSsh}
                  placeholder="~/.ssh/id_ed25519"
                  spellCheck={false}
                  value={draft.sshKeyPath}
                  onChange={(event) => set("sshKeyPath", event.target.value)}
                />
              </label>
              <button
                className="secondary"
                disabled={!draft.useSsh}
                type="button"
                onClick={() =>
                  void window.machina.remote.pickKeyFile().then((picked) => {
                    if (picked) set("sshKeyPath", picked);
                  })
                }
              >
                {t("Choose a key")}
              </button>
            </div>
            <div className="token-row">
              <label>
                {t("Passphrase (if the key has one)")}
                <input
                  autoComplete="off"
                  disabled={!draft.useSsh}
                  placeholder={host?.ssh?.hasPassphrase ? STORED_MASK : t("Leave empty if there is none")}
                  type="password"
                  value={draft.sshPassphrase}
                  onChange={(event) => set("sshPassphrase", event.target.value)}
                />
              </label>
            </div>
          </>
        )}

        </>
        )}

        {tab === "route" && (
        <>
        {/*
          The way in, when there is no route from here.

          Another server in this same list, not a second credential form: its password, its key
          and its host key check are the ones already recorded. Both RDP and SSH go through it.
        */}
        <div className="jump-choice">
          <label>
            {t("Jump server (when this one cannot be reached directly)")}
            <select
              disabled={candidates.length === 0}
              value={draft.jumpHostId}
              onChange={(event) => set("jumpHostId", event.target.value)}
            >
              <option value="">{t("None (connect directly)")}</option>
              {candidates.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.name}
                </option>
              ))}
            </select>
          </label>

          {/*
            Said here, because an empty list with no explanation reads as a broken control.

            The bastion is one of the servers in this same list rather than a second set of
            address and password fields — so its password, its key and its host key check are the
            ones already recorded, and a terminal can be opened on it like anything else. What
            that costs is this sentence: it has to be registered before it can be chosen.
          */}
          {candidates.length === 0 ? (
            <p className="form-hint">
              {t("No server here can act as a jump server yet.")}
              <strong>{t("A jump server is registered like any other server")}</strong>。
              {t("Fill in SSH and add it, and it becomes selectable here.")}
              {onAddHost && host && (
                <>
                  {" "}
                  <button className="quiet" type="button" onClick={onAddHost}>
                    {t("Register a jump server")}
                  </button>
                </>
              )}
            </p>
          ) : (
            <p className="form-hint">
              {t("Pick another server from the list. Its password, its key and its fingerprint are used exactly as registered.")}
            </p>
          )}
        </div>

        </>
        )}

        <p className="safety-note">
          {t("Passwords and passphrases are encrypted into this machine's keystore and never come back to the screen. Save with the box empty and the stored one is kept. The private key itself is not copied — it is read from where you chose, each time you connect.")}
        </p>


      </section>

      {problem && <Toast message={problem} onDismiss={() => setProblem(undefined)} />}

      {/* Outside the fields, at the foot of the dialog: the connection tab has eight of them and
          the jump tab has one,
          and a row that follows the last field is a row that moves when the category changes. */}
        <div className="setting-actions host-actions">
          {/* Only where there is something to delete. It used to be here greyed out so the row
              would not change shape between adding and editing; in a dialog you open one or the
              other, and an inert delete button beside "add" is a question nobody asked. */}
          {host && (
            <button
              className="secondary"
              disabled={busy}
              type="button"
              onClick={() => onRemove(host.id)}
            >
              {t("Delete this server")}
            </button>
          )}
          <span className="host-actions-gap" />
          <button className="secondary" disabled={busy} type="button" onClick={onCancel}>
            {t("Cancel")}
          </button>
          <button
            disabled={busy}
            type="button"
            onClick={() => {
              const reason = missing();
              setProblem(reason);
              if (reason) return;
              onSave({
                name: draft.name,
                jumpHostId: draft.jumpHostId || undefined,
                rdp: draft.useRdp
                  ? {
                      host: draft.rdpHost.trim(),
                      port: draft.rdpPort,
                      username: draft.rdpUser.trim(),
                      password: draft.rdpPassword,
                    }
                  : undefined,
                vnc: draft.useVnc
                  ? {
                      host: draft.vncHost.trim(),
                      port: draft.vncPort,
                      username: draft.vncUser.trim() || undefined,
                      password: draft.vncPassword,
                      allowPlaintext: draft.vncAllowPlaintext,
                    }
                  : undefined,
                ssh: draft.useSsh
                  ? {
                      host: draft.sshHost.trim(),
                      port: draft.sshPort,
                      username: draft.sshUser.trim(),
                      auth: draft.sshAuth,
                      tmux: draft.sshTmux,
                      keepLocal: draft.sshKeepLocal,
                      password: draft.sshPassword,
                      keyPath: draft.sshKeyPath.trim() || undefined,
                      passphrase: draft.sshPassphrase || undefined,
                    }
                  : undefined,
              });
            }}
          >
            <SwapLabel active={busy} off={host ? t("Save") : t("Add")} on={t("Saving…")} />
          </button>
        </div>
    </div>
  );
}

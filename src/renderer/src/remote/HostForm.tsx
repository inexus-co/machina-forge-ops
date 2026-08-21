import { useEffect, useState } from "react";
import { useT } from "../i18n";
import type { RemoteHostInput, RemoteHostState, SshAuth } from "../../../shared/remote";
import { WAY_IN_PROVIDERS, missingFieldsFor } from "../../../shared/wayIn";
import { FILE_TRANSFER_WAYS, missingTransferFields } from "../../../shared/fileTransfer";
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
  useJump: boolean;
  jumpHostId: string;
  /**
   * How this one is reached: empty for straight to an address, or a row of the table
   * (`shared/wayIn.ts`). One or the other, never both.
   */
  wayInProvider: string;
  /**
   * What was typed for each provider, kept per provider.
   *
   * Trying AWS, then Cloudflare, then AWS again must not mean typing the instance ID twice. Only
   * the chosen one is saved.
   */
  wayInValues: Record<string, Record<string, string>>;
  /** How files are transferred: empty for straight down the connection, or a row of `shared/fileTransfer.ts`. */
  transferVia: string;
  /** Kept per way, for the same reason the way in's values are. */
  transferValues: Record<string, Record<string, string>>;
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
    /* Reached by a command, what is stored is the name it is known by rather than an address —
       so the address field starts empty, not holding somebody else's word for it. */
    sshHost: host?.wayIn ? "" : host?.ssh?.host ?? "",
    sshPort: host?.ssh?.port ?? DEFAULT_SSH_PORT,
    sshUser: host?.ssh?.username ?? "",
    sshAuth: host?.ssh?.auth ?? "password",
    sshPassword: "",
    sshKeyPath: host?.ssh?.keyPath ?? "",
    sshPassphrase: "",
    sshTmux: host?.ssh?.tmux ?? false,
    sshKeepLocal: host?.ssh?.keepLocal ?? false,
    useJump: Boolean(host?.jumpHostId),
    jumpHostId: host?.jumpHostId ?? "",
    wayInProvider: host?.wayIn?.provider ?? "",
    wayInValues: host?.wayIn ? { [host.wayIn.provider]: { ...host.wayIn.values } } : {},
    transferVia: host?.fileTransfer?.via ?? FILE_TRANSFER_WAYS[0].id,
    transferValues: host?.fileTransfer ? { [host.fileTransfer.via]: { ...host.fileTransfer.values } } : {},
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
  /** Whether it landed. False keeps the dialog as it is, with the reason already on screen. */
  onSave: (input: RemoteHostInput) => Promise<boolean>;
  onRemove: (id: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<Draft>(() => draftOf(host));
  /**
   * What was last written down, to compare the draft against.
   *
   * Not the `host` prop: after saving, the store trims and fills in, and comparing against that
   * would leave the button alive over differences nobody typed. This is what the form itself last
   * sent, which is what "unchanged" means to whoever is looking at it.
   */
  const [saved, setSaved] = useState<Draft>(() => draftOf(host));
  /**
   * Which part of this server's settings is on screen.
   *
   * Categories rather than one long page: the address is filled in once and the rest is looked
   * at when something is wrong with it. Every field's value lives in `draft` above, so switching
   * away from a category and back does not lose what was typed into it.
   */
  const [tab, setTab] = useState<"screen" | "ssh" | "jump" | "files">("screen");
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
    setSaved(draftOf(host));
    setTouchedRdp(false);
    setTouchedVnc(false);
    setTouchedSsh(false);
  }, [host?.id]);

  /**
   * Whether there is anything to save.
   *
   * Compared as text, because every field in a draft is a string, a number or a boolean, and two
   * of them built the same way put their keys in the same order.
   */
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

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
  /** The same, for the one thing that goes right. */
  const [done, setDone] = useState<string>();

  const missing = () => {
    if (!draft.useRdp && !draft.useVnc && !draft.useSsh)
      return t("Turn on a screen (RDP or VNC) or SSH.");
    if (draft.useRdp && !draft.rdpHost.trim()) return t("Enter the RDP host.");
    if (draft.useVnc && !draft.vncHost.trim()) return t("Enter the VNC host.");
    if (draft.useSsh && !draft.wayInProvider && !draft.sshHost.trim())
      return t("Enter the SSH host.");
    // A key connection with no key would fail at connect time with a message about
    // authentication, which is the wrong thing to make somebody debug.
    if (draft.useSsh && !draft.wayInProvider && draft.sshAuth === "key" && !draft.sshKeyPath.trim()) {
      return t("Choose where the private key is.");
    }
    /* Named rather than counted: "one field is empty" leaves somebody hunting for which. */
    if (draft.useSsh && draft.wayInProvider) {
      const gaps = missingFieldsFor({
        provider: draft.wayInProvider,
        values: draft.wayInValues[draft.wayInProvider] ?? {},
      });
      if (gaps.length > 0) return t("Fill in {label} for the way in.", { label: t(gaps[0].label) });
    }
    const holes = missingTransferFields({
      via: draft.transferVia,
      values: draft.transferValues[draft.transferVia] ?? {},
    });
    if (holes.length > 0) {
      return t("Fill in {label} for file transfer.", { label: t(holes[0].label) });
    }
    return undefined;
  };

  const showStoredRdp = Boolean(host?.rdp?.hasPassword) && !touchedRdp && !draft.rdpPassword;
  const showStoredVnc = Boolean(host?.vnc?.hasPassword) && !touchedVnc && !draft.vncPassword;
  const showStoredSsh = Boolean(host?.ssh?.hasPassword) && !touchedSsh && !draft.sshPassword;
  /**
   * Whether there is anybody to sign in as.
   *
   * Only SSH has an account and a key. Asked for by name, the provider's own tool signs in with
   * the credentials the operator already has with them, and the shell arrives already logged in.
   */
  const signingIn = draft.useSsh && !draft.wayInProvider;

  return (
    <div className="settings-page host-settings">
      {/* No name here: the dialog's own header says which server this is. */}
      <nav aria-label={t("This server's settings")} className="settings-nav host-nav">
        {[
          /*
            One tab per way in, and everything about that way in it.
            Sign-in used to be its own tab, which put half of SSH in one place and half in
            another — the account here, the key over there — and asked whoever was filling it in
            to remember that.
          */
          { id: "screen" as const, label: t("Screen"), note: t("RDP and VNC") },
          { id: "ssh" as const, label: t("SSH"), note: t("The account, the key, tmux") },
          { id: "jump" as const, label: t("Jump server"), note: t("When it cannot be reached directly") },
          { id: "files" as const, label: t("File transfer"), note: t("For the ones too big for the connection") },
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
        {tab === "screen" && (
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

        </>
        )}

        {tab === "ssh" && (
        <>

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
        {/*
          How this one is reached, which is one thing or the other.

          Straight to an address, or the provider's own command — a machine with nothing open to
          the outside has no address to write, and one with an address needs no command. Two sets
          of fields on screen at once would be asking which of them is the real one.

          Every provider answers this the same way (a line run here that puts a local port at the
          far end), and the table in `shared/wayIn.ts` is the whole of what differs between them.
          A provider added there is a row of data, not a control here.
        */}
        <div className="way-in">
          <div className="way-in-choice">
            <label className="inline-check">
              <input
                checked={draft.wayInProvider === ""}
                disabled={!draft.useSsh}
                name="way-in-provider"
                type="radio"
                onChange={() => set("wayInProvider", "")}
              />
              {t("Straight to an address")}
            </label>
            {WAY_IN_PROVIDERS.map((provider) => (
              <label className="inline-check" key={provider.id}>
                <input
                  checked={draft.wayInProvider === provider.id}
                  disabled={!draft.useSsh}
                  name="way-in-provider"
                  type="radio"
                  onChange={() => set("wayInProvider", provider.id)}
                />
                {provider.ourWords ? t(provider.name) : provider.name}
              </label>
            ))}
          </div>

          {/*
            Every way in's fields in the same cell, one on top of the other.

            They ask for different things — an address and a port, three for AWS, one for
            Cloudflare — so rendered one at a time the choice would take rows away and drag
            everything under it upwards. Laid on top of each other, the widest set fixes the
            height once and choosing moves nothing.
          */}
          <div className="way-in-fields">
            <div className="way-in-pane" data-shown={draft.wayInProvider === "" ? "true" : "false"}>
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
            </div>

            {WAY_IN_PROVIDERS.map((provider) => (
              <div
                className="way-in-pane"
                data-shown={draft.wayInProvider === provider.id ? "true" : "false"}
                key={provider.id}
              >
                {provider.fields.map((field) => (
                  <label key={field.key}>
                    {field.optional
                      ? t("{label} (only if needed)", { label: t(field.label) })
                      : t(field.label)}
                    <input
                      autoComplete="off"
                      disabled={!draft.useSsh}
                      placeholder={field.placeholder}
                      spellCheck={false}
                      value={draft.wayInValues[provider.id]?.[field.key] ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          wayInValues: {
                            ...current.wayInValues,
                            [provider.id]: {
                              ...current.wayInValues[provider.id],
                              [field.key]: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                ))}
                {provider.note && (
                  <p className="form-hint">{t(provider.note, { p: "%p", l: "%l" })}</p>
                )}
              </div>
            ))}
          </div>

          {/* True whichever is chosen, so choosing does not reword it and move what is under it. */}
          <p className="form-hint">
            {t("A provider's command runs on this machine, as you, with the credentials you already use with them, and what comes back is a shell — so there is no account, no key and no host key here, and no files panel either. A jump server is not used as well.")}
          </p>
        </div>

        {/*
          The account and the sign-in, which belong to SSH and to nothing else.

          Reached by the provider's own command there is no account of ours and no key: their tool
          decided who we are, and the shell arrives already logged in. So these go grey rather than
          away: a block that vanishes takes the two tick boxes under it up with it, and whoever was
          reaching for one presses the other.
        */}
        <div className="token-row">
          <label>
            {t("User")}
            <input
              disabled={!signingIn}
              placeholder="root"
              spellCheck={false}
              value={draft.sshUser}
              onChange={(event) => set("sshUser", event.target.value)}
            />
          </label>
        </div>
        {/* Both fields would be misleading: only one of them is used, and the unused one
            still looks like something that has to be filled in. */}
        <div className="auth-choice">
          {(["password", "key"] as SshAuth[]).map((each) => (
            <button
              className={draft.sshAuth === each ? "active" : undefined}
              disabled={!signingIn}
              key={each}
              type="button"
              onClick={() => set("sshAuth", each)}
            >
              {each === "password" ? t("Password") : t("Private key")}
            </button>
          ))}
        </div>

        {/*
          Both are always here, one on top of the other.

          The unused one is hidden rather than shown as something else to fill in — but it still
          occupies the same cell, so the taller of the two sets the height once, and pressing the
          choice moves nothing below it. Swapping one for the other used to take a line away and
          drag the two tick boxes up under whoever was reaching for them.
        */}
        <div className="auth-fields">
          <div className="auth-pane" data-shown={draft.sshAuth === "password" ? "true" : "false"}>
            <div className="token-row">
              <label>
                {t("Password")}
                <input
                  autoComplete="off"
                  disabled={!signingIn}
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
          </div>

          <div className="auth-pane" data-shown={draft.sshAuth === "key" ? "true" : "false"}>
            <div className="key-row">
              <label>
                {t("Private key")}
                {/* Typeable as well as pickable: a path that is already on the clipboard, or
                    one somebody knows by heart, should not need a file dialog. */}
                <input
                  disabled={!signingIn}
                  placeholder="~/.ssh/id_ed25519"
                  spellCheck={false}
                  value={draft.sshKeyPath}
                  onChange={(event) => set("sshKeyPath", event.target.value)}
                />
              </label>
              <button
                className="secondary"
                disabled={!signingIn}
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
                  disabled={!signingIn}
                  placeholder={host?.ssh?.hasPassphrase ? STORED_MASK : t("Leave empty if there is none")}
                  type="password"
                  value={draft.sshPassphrase}
                  onChange={(event) => set("sshPassphrase", event.target.value)}
                />
              </label>
            </div>
          </div>
        </div>

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

        {tab === "jump" && (
        <>

        {/*
          The way in, when there is no route from here.

          Another server in this same list, not a second credential form: its password, its key
          and its host key check are the ones already recorded. Both RDP and SSH go through it.
        */}
        <h4>
          <label className="inline-check">
            <input
              checked={draft.useJump}
              type="checkbox"
              onChange={(event) => set("useJump", event.target.checked)}
            />
            {t("Go in through another server")}
          </label>
        </h4>
        <div className="jump-choice">
          <label>
            {t("Jump server (when this one cannot be reached directly)")}
            <select
              disabled={!draft.useJump || candidates.length === 0}
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

        {tab === "files" && (
        <>

        {/*
          Where a file goes when it does not fit down the connection.

          Straight down it is the normal answer and the first row: SFTP over SSH, and text down the
          stream over a shell handed back by a provider's command. That suits a configuration file
          and not a database dump, so the other rows name a place both machines can reach — the
          operator's own, with whatever store they already run. Which store is theirs to say; the
          table (`shared/fileTransfer.ts`) holds a row each, and the last row is a store nobody here
          has heard of.
        */}
        <div className="way-in">
          <div className="way-in-choice">
            {FILE_TRANSFER_WAYS.map((way) => (
              <label className="inline-check" key={way.id}>
                <input
                  checked={draft.transferVia === way.id}
                  name="file-move"
                  type="radio"
                  onChange={() => set("transferVia", way.id)}
                />
                {way.ourWords ? t(way.name) : way.name}
              </label>
            ))}
          </div>

          {/* Laid one on top of another in a single cell, so choosing does not move anything. */}
          <div className="way-in-fields">
            {FILE_TRANSFER_WAYS.map((way) => (
              <div
                className="way-in-pane"
                data-shown={draft.transferVia === way.id ? "true" : "false"}
                key={way.id}
              >
                {way.fields.map((field) => (
                  <label key={field.key}>
                    {t(field.label)}
                    <input
                      autoComplete="off"
                      placeholder={field.placeholder}
                      spellCheck={false}
                      value={draft.transferValues[way.id]?.[field.key] ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          transferValues: {
                            ...current.transferValues,
                            [way.id]: {
                              ...current.transferValues[way.id],
                              [field.key]: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                ))}
                <p className="form-hint">{t(way.note, { f: "%f", n: "%n" })}</p>
              </div>
            ))}
          </div>

          {/* True whichever is chosen, so choosing does not reword it and move what is under it. */}
          <p className="form-hint">
            {t("Nothing of the store's is kept here — each machine uses the credentials it already has, and what is left in it is removed once the file is across. The seven steps of changing a file are the same either way: the real file is fetched, copied on both sides, and the difference goes on an approval card before anything is written.")}
          </p>
        </div>

        </>
        )}

        <p className="safety-note">
          {t("Passwords and passphrases are encrypted into this machine's keystore and never come back to the screen. Save with the box empty and the stored one is kept. The private key itself is not copied — it is read from where you chose, each time you connect.")}
        </p>


      </section>

      {problem && <Toast message={problem} onDismiss={() => setProblem(undefined)} />}
      {done && <Toast kind="good" message={done} onDismiss={() => setDone(undefined)} />}

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
          {/*
            Dead while there is nothing to save.

            Not the same as the old "dead until the form is complete", which read as a broken
            application in front of a form that looked filled in. Nothing typed is not an
            incomplete answer — it is no answer, and there is nothing for the press to do.
          */}
          <button
            disabled={busy || !changed}
            type="button"
            onClick={() => {
              const reason = missing();
              setProblem(reason);
              if (reason) return;
              const wayIn =
                draft.useSsh && draft.wayInProvider
                  ? {
                      provider: draft.wayInProvider,
                      values: draft.wayInValues[draft.wayInProvider] ?? {},
                    }
                  : undefined;
              const input = {
                name: draft.name,
                /* One way in: the provider's own reaches machines a jump server cannot, so it
                   wins, and only what was chosen is saved at all. */
                jumpHostId:
                  wayIn || !draft.useJump ? undefined : draft.jumpHostId || undefined,
                wayIn,
                /* The first row is "straight down the connection", which is the absence of a
                   store rather than a store called nothing. */
                fileTransfer:
                  draft.transferVia && draft.transferVia !== FILE_TRANSFER_WAYS[0].id
                    ? {
                        via: draft.transferVia,
                        values: draft.transferValues[draft.transferVia] ?? {},
                      }
                    : undefined,
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
                      /* Reached by a command there is no address, no account and no key. Left
                         empty rather than filled with something nobody typed — what names the
                         machine is the instance id in `wayIn`. */
                      host: wayIn ? "" : draft.sshHost.trim(),
                      port: draft.sshPort,
                      username: wayIn ? "" : draft.sshUser.trim(),
                      auth: wayIn ? "password" : draft.sshAuth,
                      tmux: draft.sshTmux,
                      keepLocal: draft.sshKeepLocal,
                      password: wayIn ? "" : draft.sshPassword,
                      keyPath: wayIn ? undefined : draft.sshKeyPath.trim() || undefined,
                      passphrase: wayIn ? undefined : draft.sshPassphrase || undefined,
                    }
                  : undefined,
              };
              /*
               * The dialog stays where it is.
               *
               * It used to vanish on the press, which took the operator back to a list and left
               * them to work out whether anything had happened — and when the connection then
               * failed, they had to find their way back in to change the one thing again. Saving
               * is not leaving: what was saved is said, the button goes quiet because there is
               * nothing left to save, and the way out is the way it always was.
               */
              void onSave(input).then((landed) => {
                if (!landed) return;
                setSaved(draft);
                setDone(t("Saved."));
              });
            }}
          >
            <SwapLabel active={busy} off={host ? t("Save") : t("Add")} on={t("Saving…")} />
          </button>
        </div>
    </div>
  );
}

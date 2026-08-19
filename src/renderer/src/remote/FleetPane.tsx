import { useEffect, useRef, useState } from "react";
import { t, type Translate } from "../../../shared/i18n";
import { useT } from "../i18n";
import type {
  RemoteAgentRunState,
  RemoteApprovalMode,
  RememberChoice,
} from "../../../shared/remoteAgent";
import type { RemoteHostState } from "../../../shared/remote";
import { ProposalCard } from "./RemoteAgentChat";
import { describeError } from "./Toast";

/**
 * One goal, many servers, at once.
 *
 * The engine already works per host — start, approve, reject, getState and onState are all keyed
 * by host id, and a session runs independently for each. So this is mostly a renderer: pick the
 * servers, write the goal, start them, and watch a row per host. Each host's logbook is applied
 * automatically, so "restart nginx on all five" arrives on each with that server's own memory.
 *
 * Runs are independent: one server failing does not touch the others, and each host's approvals
 * queue one at a time, so at most one card per host is ever waiting.
 */

/*
 * A function, not a constant: words read at import time would be the language the window opened
 * in, and would keep saying it after the operator switched.
 */
const modes = (t: Translate): Array<{ value: RemoteApprovalMode; label: string }> => [
  { value: "step", label: t("Step by step") },
  { value: "auto", label: t("Automatic (destructive and sudo still asked)") },
  { value: "plan", label: t("Plan only (runs nothing)") },
];

export function FleetPane({ onError }: { onError: (message?: string) => void }) {
  const t = useT();
  const [hosts, setHosts] = useState<RemoteHostState[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState<RemoteApprovalMode>("step");
  const [started, setStarted] = useState(false);
  const [states, setStates] = useState<Record<string, RemoteAgentRunState>>({});
  const busy = useRef(false);

  useEffect(() => {
    void window.machina.remote
      .list()
      .then((list) => setHosts(list.filter((host) => host.ssh || host.rdp || host.vnc)))
      .catch((cause) => onError(describeError(cause)));
  }, [onError]);

  // One subscription for every host; the row for each reads its own state.
  useEffect(
    () =>
      window.machina.remoteAgent.onState((hostId, state) =>
        setStates((current) => ({ ...current, [hostId]: state })),
      ),
    [],
  );

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const start = () => {
    if (busy.current || !goal.trim() || chosen.size === 0) return;
    busy.current = true;
    setStarted(true);
    onError(undefined);
    /* No shell means the screen — whichever protocol draws it. */
    const control = (host: RemoteHostState) =>
      !host.ssh && (host.rdp || host.vnc) ? "screen" : "shell";
    void (async () => {
      for (const host of hosts) {
        if (!chosen.has(host.id)) continue;
        try {
          await window.machina.remoteAgent.start(host.id, {
            goal: goal.trim(),
            approvalMode: mode,
            control: control(host),
          });
        } catch (cause) {
          onError(`${host.name}：${describeError(cause)}`);
        }
      }
      busy.current = false;
    })();
  };

  const answer = (hostId: string, approved: boolean, remember?: RememberChoice) =>
    void (approved
      ? window.machina.remoteAgent.approve(hostId, statesRef(hostId)?.pending?.toolCallId ?? "", remember)
      : window.machina.remoteAgent.reject(hostId, statesRef(hostId)?.pending?.toolCallId ?? "", undefined, remember)
    ).catch((cause) => onError(describeError(cause)));

  const statesRef = (hostId: string) => states[hostId];

  const chosenHosts = hosts.filter((host) => chosen.has(host.id));

  if (!started) {
    return (
      <div className="settings-body fleet-pane">
        <div className="settings-lede">
          <h2>{t("Run across servers")}</h2>
          <p>
            {t("Hands the same goal to every server you picked. Each run is on its own — one failure does not touch the others. Each server's record still applies.")}
          </p>
        </div>

        <fieldset className="settings-fieldset">
          <legend>{t("Servers ({count})", { count: chosen.size })}</legend>
          <div className="fleet-hosts">
            {hosts.length === 0 && <p className="settings-note">{t("No server here has anywhere to connect to.")}</p>}
            {hosts.map((host) => (
              <label className="settings-check" key={host.id}>
                <input checked={chosen.has(host.id)} type="checkbox" onChange={() => toggle(host.id)} />
                {host.name}
                <small>{host.ssh ? "SSH" : host.rdp ? "RDP" : "VNC"}</small>
              </label>
            ))}
          </div>
        </fieldset>

        <label>
          {t("Goal")}
          <textarea
            className="settings-code"
            placeholder={t("e.g. Restart nginx and check whether the 502s stopped")}
            rows={4}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
          />
        </label>

        <label>
          {t("How to approve")}
          <select value={mode} onChange={(event) => setMode(event.target.value as RemoteApprovalMode)}>
            {modes(t).map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <div className="fleet-start">
          <button disabled={!goal.trim() || chosen.size === 0} type="button" onClick={start}>
            {t("Start on {count}", { count: chosen.size })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-body fleet-pane">
      <div className="settings-lede">
        <h2>{t("Run across servers")}</h2>
        <p>{goal}</p>
      </div>
      <div className="fleet-rows">
        {chosenHosts.map((host) => {
          const state = states[host.id];
          return (
            <div className="fleet-row" key={host.id}>
              <div className="fleet-row-head">
                <button
                  className="fleet-row-name"
                  type="button"
                  title={t("Open this server's conversation")}
                  onClick={() =>
                    void window.machina.remotePanels.open("runs", host.id).catch(() => undefined)
                  }
                >
                  {host.name}
                </button>
                <span className="fleet-row-state">{describeState(state)}</span>
              </div>
              {state?.pending && (
                <ProposalCard
                  busy={false}
                  hostId={host.id}
                  proposal={state.pending}
                  onApprove={(_id, remember) => answer(host.id, true, remember)}
                  onReject={(_id, remember) => answer(host.id, false, remember)}
                  onGrow={() => undefined}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="fleet-start">
        <button className="secondary" type="button" onClick={() => setStarted(false)}>
          {t("Set up another run")}
        </button>
      </div>
    </div>
  );
}

function describeState(state?: RemoteAgentRunState): string {
  if (!state) return t("Waiting");
  if (state.pending) return t("Waiting for approval");
  if (state.running) return state.steps ? t("Command {n}, running…", { n: state.steps }) : t("Running…");
  if (state.finished === "done") return t("Done");
  if (state.finished === "error") return t("Error");
  if (state.finished === "question") return t("It has a question");
  if (state.finished) return t("Stopped");
  return t("Waiting");
}

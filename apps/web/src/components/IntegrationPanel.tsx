"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RealtimeAgentPanel } from "./RealtimeAgentPanel";

interface RuntimeStatus {
  integrations?: {
    weather?: { configured: boolean; source: string };
    realtimeAgent?: RealtimeStatus;
  };
}

interface RealtimeStatus {
  configured: boolean;
  enabled: boolean;
  status: "disabled" | "not_configured" | "ready";
  model: string;
  voice: string;
  knowledgeDomains: string[];
  message?: string;
}

interface SourceResponse {
  configured: boolean;
  sources: Array<{ name: string; status: string; url: string; fetchedAt?: string }>;
}

interface AbbHealth {
  configured: boolean;
  status: string;
  message?: string;
}

interface AgentStatus {
  configured: boolean;
  enabled: boolean;
  status: string;
  tools?: string[];
  message?: string;
}

function stateClass(status: string | undefined, configured?: boolean) {
  if (
    status === "ready" ||
    status === "completed" ||
    status === "ok" ||
    status === "token_ok" ||
    status === "healthy" ||
    status === "submitted"
  ) return "integration-card__state--ready";
  if (configured === false || status === "not_configured") return "integration-card__state--muted";
  if (status === "disabled") return "integration-card__state--idle";
  if (status === "error") return "integration-card__state--error";
  return "integration-card__state--idle";
}

function labelFor(status: string | undefined, configured?: boolean) {
  if (configured === false || status === "not_configured") return "not configured";
  if (status === "token_ok") return "token ok";
  return status ?? "checking";
}

export function IntegrationPanel() {
  const apiHost = useMemo(() => process.env.NEXT_PUBLIC_API_HOST ?? "http://localhost:4001", []);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [sources, setSources] = useState<SourceResponse | null>(null);
  const [abb, setAbb] = useState<AbbHealth | null>(null);
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStatus | null>(null);
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [runtimeRes, sourceRes, abbRes, agentRes, realtimeRes] = await Promise.all([
      fetch(`${apiHost}/status`).then((r) => r.json()).catch(() => null),
      fetch(`${apiHost}/validation/sources`).then((r) => r.json()).catch(() => null),
      fetch(`${apiHost}/validation/abb/health`).then((r) => r.json()).catch(() => null),
      fetch(`${apiHost}/validation/agent/status`).then((r) => r.json()).catch(() => null),
      fetch(`${apiHost}/validation/realtime/status`).then((r) => r.json()).catch(() => null),
    ]);

    setRuntime(runtimeRes);
    setSources(sourceRes);
    setAbb(abbRes);
    setAgent(agentRes);
    setRealtime(realtimeRes ?? runtimeRes?.integrations?.realtimeAgent ?? null);
  }, [apiHost]);

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : String(err)));
  }, [load]);

  async function refreshSources() {
    setBusy("sources");
    try {
      const response = await fetch(`${apiHost}/validation/sources/refresh`, { method: "POST" });
      const payload = await response.json();
      setSources(payload);
      setMessage(payload.configured ? "Official-source cache refreshed." : "Firecrawl is not configured.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function runAgent() {
    setBusy("agent");
    try {
      const response = await fetch(`${apiHost}/validation/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Validate the live Suvion dashboard integrations and emissions assumptions." }),
      });
      const payload = await response.json();
      setMessage(payload.output ?? payload.message ?? payload.status ?? "Validation agent finished.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const firecrawlStatus = sources?.configured ? "completed" : "not_configured";
  const weather = runtime?.integrations?.weather;

  return (
    <section className="integration-panel" aria-label="External integrations">
      <div className="section-label">INTEGRATIONS</div>
      <div className="integration-grid">
        <div className="integration-card">
          <div className="integration-card__topline">
            <span className="integration-card__name">Firecrawl Sources</span>
            <span className={`integration-card__state ${stateClass(firecrawlStatus, sources?.configured)}`}>
              {labelFor(firecrawlStatus, sources?.configured)}
            </span>
          </div>
          <div className="integration-card__metric">{sources?.sources?.length ?? 0}</div>
          <div className="integration-card__detail">official maritime references cached for reports</div>
          <button type="button" onClick={refreshSources} disabled={busy === "sources"}>
            {busy === "sources" ? "Refreshing" : "Refresh"}
          </button>
        </div>

        <div className="integration-card">
          <div className="integration-card__topline">
            <span className="integration-card__name">OpenAI Validation</span>
            <span className={`integration-card__state ${stateClass(agent?.status, agent?.configured)}`}>
              {labelFor(agent?.status, agent?.configured)}
            </span>
          </div>
          <div className="integration-card__metric">{agent?.tools?.length ?? 0}</div>
          <div className="integration-card__detail">deterministic tools wired through Agents SDK</div>
          <button type="button" onClick={runAgent} disabled={busy === "agent" || agent?.status !== "ready"}>
            {busy === "agent" ? "Running" : "Run check"}
          </button>
        </div>

        <div className="integration-card integration-card--wide">
          <div className="integration-card__topline">
            <span className="integration-card__name">OpenAI Realtime Agent</span>
            <span className={`integration-card__state ${stateClass(realtime?.status, realtime?.configured)}`}>
              {labelFor(realtime?.status, realtime?.configured)}
            </span>
          </div>
          <RealtimeAgentPanel apiHost={apiHost} status={realtime} onStatusMessage={setMessage} />
        </div>

        <div className="integration-card">
          <div className="integration-card__topline">
            <span className="integration-card__name">ABB Route Check</span>
            <span className={`integration-card__state ${stateClass(abb?.status, abb?.configured)}`}>
              {labelFor(abb?.status, abb?.configured)}
            </span>
          </div>
          <div className="integration-card__metric">ABB</div>
          <div className="integration-card__detail">{abb?.message ?? "credential-gated reasonableness check"}</div>
        </div>

        <div className="integration-card">
          <div className="integration-card__topline">
            <span className="integration-card__name">OpenWeather</span>
            <span className={`integration-card__state ${stateClass(weather?.configured ? "ready" : "not_configured", weather?.configured)}`}>
              {weather?.configured ? "ready" : "not configured"}
            </span>
          </div>
          <div className="integration-card__metric">WX</div>
          <div className="integration-card__detail">server-side key, browser geolocation optional</div>
        </div>
      </div>
      {message && <div className="integration-panel__message">{message}</div>}
    </section>
  );
}

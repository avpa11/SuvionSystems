"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import type { SensorState, SensorUpdate } from "../hooks/useSensorData";
import {
  RealtimeAgentPanel,
  type RealtimeAgentPanelHandle,
  type RealtimeStatus,
} from "./RealtimeAgentPanel";

type ChatRole = "assistant" | "user";

interface ChatMessage {
  id: number;
  role: ChatRole;
  content: string;
}

interface AgentStatus {
  configured: boolean;
  enabled: boolean;
  status: "disabled" | "not_configured" | "ready";
  message?: string;
}

interface AgentResponse {
  configured: boolean;
  status: "disabled" | "not_configured" | "completed" | "error";
  output?: string;
  message?: string;
}

interface AgentChatPopupProps {
  sensorState: SensorState;
}

const SENSOR_LABELS: Partial<Record<keyof SensorState, string>> = {
  fuel: "fuel flow",
  generator: "generator current",
  water: "water use",
  temperature: "ambient temperature",
  co2: "CO2 rate",
  depthBelowKeel: "depth below keel",
  depthBelowTransducer: "depth below transducer",
  waterTemp: "water temperature",
  waterLevel: "water tank level",
  heading: "heading",
  cog: "course over ground",
  sog: "speed over ground",
  stw: "speed through water",
  positionLat: "latitude",
  positionLon: "longitude",
  windAngle: "apparent wind angle",
  windSpeed: "apparent wind speed",
};

function summarizeReading(
  label: string,
  update: SensorUpdate | null,
): string | null {
  if (!update) return null;
  return `${label}: ${update.value.toFixed(2)} ${update.unit}`;
}

function summarizeSensors(sensorState: SensorState): string {
  const lines = Object.entries(SENSOR_LABELS)
    .map(([key, label]) =>
      summarizeReading(label, sensorState[key as keyof SensorState]),
    )
    .filter((line): line is string => Boolean(line));

  return lines.length > 0
    ? lines.join("; ")
    : "No live sensor readings are available yet.";
}

function transcript(messages: ChatMessage[]): string {
  return messages
    .slice(-6)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

export function AgentChatPopup({ sensorState }: AgentChatPopupProps) {
  const apiHost = useMemo(
    () => process.env.NEXT_PUBLIC_API_HOST ?? "http://localhost:4001",
    [],
  );
  const realtimeRef = useRef<RealtimeAgentPanelHandle | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      content:
        "Ask about vessel data and emissions. The assistant requires an optional server-side OpenAI connection.",
    },
  ]);

  async function loadStatus() {
    try {
      const [agentResponse, realtimeResponse] = await Promise.all([
        fetch(`${apiHost}/validation/agent/status`),
        fetch(`${apiHost}/validation/realtime/status`),
      ]);
      setStatus(await agentResponse.json());
      setRealtimeStatus(await realtimeResponse.json());
    } catch {
      setStatus({
        configured: false,
        enabled: false,
        status: "not_configured",
        message: "API connection unavailable.",
      });
      setRealtimeStatus(null);
    }
  }

  function appendMessage(role: ChatRole, content: string) {
    setMessages((current) => {
      const previous = current[current.length - 1];
      if (previous?.role === role && previous.content === content)
        return current;
      return [
        ...current,
        { id: Date.now() + Math.floor(Math.random() * 1000), role, content },
      ];
    });
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;

    const userMessage: ChatMessage = { id: Date.now(), role: "user", content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setBusy(true);

    try {
      if (realtimeRef.current?.sendTextMessage(content)) {
        setBusy(false);
        return;
      }

      const prompt = [
        "Answer as Suvion's maritime operations and emissions assistant.",
        "Use the live sensor snapshot when relevant. Do not claim certification or legal compliance.",
        `Live sensor snapshot: ${summarizeSensors(sensorState)}`,
        `Recent chat:\n${transcript(nextMessages)}`,
        `User request: ${content}`,
      ].join("\n\n");

      const response = await fetch(`${apiHost}/validation/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const payload = (await response.json()) as AgentResponse;
      const reply =
        payload.output ??
        payload.message ??
        (payload.status === "not_configured"
          ? "OpenAI is not configured for this API container."
          : "The agent could not produce a response.");

      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, role: "assistant", content: reply },
      ]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: err instanceof Error ? err.message : String(err),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function toggleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) void loadStatus();
  }

  return (
    <div className={`agent-chat ${open ? "agent-chat--open" : ""}`}>
      {open && (
        <div
          className="agent-chat__panel"
          role="dialog"
          aria-label="Suvion agent chat"
        >
          <div className="agent-chat__header">
            <div>
              <div className="agent-chat__title">Suvion Agent</div>
              <div className="agent-chat__status">
                Text {status?.status ?? "checking"} / Voice{" "}
                {realtimeStatus?.status ?? "checking"}
              </div>
            </div>
            <button
              type="button"
              className="agent-chat__close"
              onClick={toggleOpen}
              aria-label="Close chat"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>

          <div className="agent-chat__messages" aria-live="polite">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`agent-chat__message agent-chat__message--${message.role}`}
              >
                {message.content}
              </div>
            ))}
            {busy && (
              <div className="agent-chat__message agent-chat__message--assistant">
                Thinking...
              </div>
            )}
          </div>

          {status?.message && (
            <div className="agent-chat__notice">{status.message}</div>
          )}
          {realtimeStatus?.message && (
            <div className="agent-chat__notice">{realtimeStatus.message}</div>
          )}

          <div className="agent-chat__voice">
            <RealtimeAgentPanel
              ref={realtimeRef}
              apiHost={apiHost}
              status={realtimeStatus}
              onStatusMessage={(message) => appendMessage("assistant", message)}
              onTranscript={(role, text) => appendMessage(role, text)}
            />
          </div>

          <form className="agent-chat__form" onSubmit={sendMessage}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Message to the maritime assistant"
              maxLength={8000}
              placeholder="Ask about emissions or vessel data"
              rows={2}
            />
            <button
              type="submit"
              disabled={
                busy || status?.status !== "ready" || draft.trim().length === 0
              }
            >
              <Send size={16} aria-hidden="true" />
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="agent-chat__launcher"
        onClick={toggleOpen}
        aria-expanded={open}
      >
        <MessageCircle size={17} aria-hidden="true" />
        AI Chat
      </button>
    </div>
  );
}

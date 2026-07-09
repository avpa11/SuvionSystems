import { DEFAULT_OPENAI_REALTIME_MODEL, RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { formatVesselContextForAgent, getVesselContext } from "./vesselContext.js";

export interface RealtimeAgentStatus {
  configured: boolean;
  enabled: boolean;
  status: "disabled" | "not_configured" | "ready";
  sdk: "@openai/agents/realtime";
  model: string;
  voice: string;
  transport: "webrtc";
  knowledgeDomains: string[];
  endpoints: {
    status: string;
    sessionConfig: string;
    calls: string;
    vesselContext: string;
  };
  message?: string;
}

export interface RealtimeSessionConfigResponse {
  configured: boolean;
  enabled: boolean;
  status: "disabled" | "not_configured" | "completed" | "error";
  config?: Record<string, unknown>;
  message?: string;
}

export interface RealtimeCallResponse {
  configured: boolean;
  enabled: boolean;
  status: "disabled" | "not_configured" | "completed" | "error";
  sdp?: string;
  contentType?: "application/sdp";
  message?: string;
}

const KNOWLEDGE_DOMAINS = [
  "CO2 emissions and fuel factors",
  "IMO CII/EEXI validation boundaries",
  "maritime vessel operations",
  "route planning and navigation watchstanding",
  "weather interpretation for passage planning",
  "Signal K and NMEA 0183 sensor context",
  "live backend vessel signals, position, and emissions context",
];

export function getRealtimeModel(): string {
  return process.env.OPENAI_REALTIME_MODEL || DEFAULT_OPENAI_REALTIME_MODEL;
}

function realtimeVoice(): string {
  return process.env.OPENAI_REALTIME_VOICE || "alloy";
}

function realtimeEnabled(): boolean {
  return process.env.REALTIME_AGENT_ENABLED !== "false";
}

export function getMaritimeRealtimeInstructions(vesselContext?: string): string {
  const instructions = [
    "You are Suvion's realtime maritime operations agent.",
    "You help with CO2 emissions reasoning, vessel operations, route planning, navigation, weather, and sensor interpretation.",
    "You have backend vessel context for the current voice session. Use it to answer questions about live signals, position, depth, wind, fuel, generator, water, tank, electrical, and CO2 emissions.",
    "If a value is marked stale or unavailable, say that clearly and ask for a fresh signal before making navigation, route, or emissions recommendations that depend on it.",
    "Use local Suvion calculations as deterministic in-app estimates. Do not claim class society approval, IMO certification, or legal compliance.",
    "Treat ABB route/weather optimization as a reasonableness check only when comparable inputs exist.",
    "Treat Firecrawl and official-source validation as source evidence, not as proof of certification.",
    "When navigation or weather context is missing, say what input is needed before making a recommendation.",
    "Keep voice responses concise and operationally clear.",
  ];

  if (vesselContext) {
    instructions.push(["Current backend vessel context:", vesselContext].join("\n"));
  }

  return instructions.join("\n");
}

export function createMaritimeRealtimeAgent(vesselContext?: string): RealtimeAgent {
  return new RealtimeAgent({
    name: "Suvion Maritime Realtime Agent",
    instructions: getMaritimeRealtimeInstructions(vesselContext),
    voice: realtimeVoice(),
  });
}

export function getRealtimeAgentStatus(): RealtimeAgentStatus {
  const configured = Boolean(process.env.OPENAI_API_KEY);
  const enabled = realtimeEnabled();
  const base = {
    configured,
    enabled,
    sdk: "@openai/agents/realtime" as const,
    model: getRealtimeModel(),
    voice: realtimeVoice(),
    transport: "webrtc" as const,
    knowledgeDomains: KNOWLEDGE_DOMAINS,
    endpoints: {
      status: "/validation/realtime/status",
      sessionConfig: "/validation/realtime/session-config",
      calls: "/validation/realtime/calls",
      vesselContext: "/validation/vessel-context",
    },
  };

  if (!enabled) {
    return {
      ...base,
      status: "disabled",
      message: "Set REALTIME_AGENT_ENABLED=true to enable browser voice sessions.",
    };
  }

  if (!configured) {
    return {
      ...base,
      status: "not_configured",
      message: "OPENAI_API_KEY is required for realtime voice sessions.",
    };
  }

  return {
    ...base,
    status: "ready",
  };
}

export async function getRealtimeSessionConfig(): Promise<RealtimeSessionConfigResponse> {
  const status = getRealtimeAgentStatus();

  if (status.status === "disabled") {
    return {
      configured: status.configured,
      enabled: status.enabled,
      status: "disabled",
      message: status.message,
    };
  }

  if (status.status === "not_configured") {
    return {
      configured: false,
      enabled: status.enabled,
      status: "not_configured",
      message: status.message,
    };
  }

  try {
    const vesselContext = await getVesselContext();
    const vesselContextText = formatVesselContextForAgent(vesselContext);
    const config = await RealtimeSession.computeInitialSessionConfig(
      createMaritimeRealtimeAgent(vesselContextText),
      {
        model: getRealtimeModel(),
        config: {
          outputModalities: ["text", "audio"],
          audio: {
            output: {
              voice: realtimeVoice(),
            },
          },
          reasoning: {
            effort: "low",
          },
        },
        workflowName: "Suvion Maritime Realtime Agent",
      }
    );

    return {
      configured: true,
      enabled: true,
      status: "completed",
      config: config as Record<string, unknown>,
    };
  } catch (err) {
    return {
      configured: true,
      enabled: true,
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function createRealtimeCall(sdp: string): Promise<RealtimeCallResponse> {
  const configResponse = await getRealtimeSessionConfig();

  if (configResponse.status !== "completed" || !configResponse.config) {
    return {
      configured: configResponse.configured,
      enabled: configResponse.enabled,
      status: configResponse.status,
      message: configResponse.message,
    };
  }

  const url = process.env.OPENAI_REALTIME_CALLS_URL || "https://api.openai.com/v1/realtime/calls";
  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(configResponse.config));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form,
    });
    const responseText = await response.text();

    if (!response.ok) {
      return {
        configured: true,
        enabled: true,
        status: "error",
        message: responseText || `OpenAI Realtime call failed with HTTP ${response.status}.`,
      };
    }

    return {
      configured: true,
      enabled: true,
      status: "completed",
      contentType: "application/sdp",
      sdp: responseText,
    };
  } catch (err) {
    return {
      configured: true,
      enabled: true,
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

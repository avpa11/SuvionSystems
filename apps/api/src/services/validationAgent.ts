import { Agent, run, tool, type FunctionTool } from "@openai/agents";
import { calculateCO2, carbonIntensity, isFuelType } from "@repo/emissions";
import { getValidationSources } from "./officialSources.js";
import {
  formatVesselContextForAgent,
  getVesselContext,
} from "./vesselContext.js";

export interface ValidationAgentResponse {
  configured: boolean;
  status: "disabled" | "not_configured" | "completed" | "error";
  output?: string;
  message?: string;
}

export interface ValidationAgentStatus {
  configured: boolean;
  enabled: boolean;
  status: "disabled" | "not_configured" | "ready";
  sdk: "@openai/agents";
  tools: string[];
  message?: string;
}

function objectArg(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
}

const emptyObjectParameters: {
  type: "object";
  properties: Record<string, never>;
  required: string[];
  additionalProperties: true;
} = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: true,
};

export const validationAgentTools: FunctionTool<unknown, any, unknown>[] = [
  tool({
    name: "calculate_local_emissions",
    description:
      "Calculate local Suvion CO2 output and carbon intensity for a fuel type and volume.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        fuelType: { type: "string" },
        consumptionL: { type: "number" },
      },
      required: ["fuelType", "consumptionL"],
      additionalProperties: true,
    },
    execute: (input) => {
      const args = objectArg(input);
      const fuelType = String(args.fuelType ?? "diesel");
      const consumptionL = Number(args.consumptionL ?? 0);

      if (!isFuelType(fuelType)) {
        return { ok: false, error: `Unsupported fuelType: ${fuelType}` };
      }

      return {
        ok: true,
        fuelType,
        consumptionL,
        co2Kg: calculateCO2(fuelType, consumptionL),
        carbonIntensityKgPerL: carbonIntensity(fuelType),
      };
    },
  }),
  tool({
    name: "lookup_official_sources",
    description:
      "Return cached official IMO and Signal K source metadata, refreshed through Firecrawl when configured.",
    strict: false,
    parameters: emptyObjectParameters,
    execute: () => getValidationSources(),
  }),
  tool({
    name: "get_live_vessel_context",
    description:
      "Return the latest backend vessel context: live signals, position, emissions, recent averages, anomalies, and source freshness.",
    strict: false,
    parameters: emptyObjectParameters,
    execute: () => getVesselContext(),
  }),
  tool({
    name: "summarize_validation",
    description:
      "Build a deterministic validation summary from available local and external checks.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        sourceCount: { type: "number" },
      },
      required: [],
      additionalProperties: true,
    },
    execute: (input) => {
      const args = objectArg(input);
      return {
        summary:
          "Suvion calculations remain local and deterministic; external services provide source evidence only.",
        sourceCount: Number(
          args.sourceCount ?? getValidationSources().sources.length,
        ),
      };
    },
  }),
];

export function createValidationAgent(): Agent {
  return new Agent({
    name: "Suvion Maritime Validation Agent",
    instructions:
      "Answer vessel operations and CO2 emissions questions using deterministic Suvion tools. Use get_live_vessel_context before answering questions about current vessel state, position, signals, emissions, averages, or anomalies. Use official-source lookup before making source claims. Never claim certification or guaranteed IMO compliance.",
    tools: validationAgentTools,
  });
}

export function getValidationAgentStatus(): ValidationAgentStatus {
  const configured = Boolean(process.env.OPENAI_API_KEY);
  const enabled = process.env.VALIDATION_AGENT_ENABLED === "true";

  if (!enabled) {
    return {
      configured,
      enabled,
      status: "disabled",
      sdk: "@openai/agents",
      tools: validationAgentTools.map((toolDefinition) => toolDefinition.name),
      message:
        "Set VALIDATION_AGENT_ENABLED=true to run source/report validation through the OpenAI Agents SDK.",
    };
  }

  if (!configured) {
    return {
      configured: false,
      enabled,
      status: "not_configured",
      sdk: "@openai/agents",
      tools: validationAgentTools.map((toolDefinition) => toolDefinition.name),
      message: "OPENAI_API_KEY is required to run the validation agent.",
    };
  }

  return {
    configured: true,
    enabled,
    status: "ready",
    sdk: "@openai/agents",
    tools: validationAgentTools.map((toolDefinition) => toolDefinition.name),
  };
}

export async function runValidationAgent(
  prompt: string,
): Promise<ValidationAgentResponse> {
  if (process.env.VALIDATION_AGENT_ENABLED !== "true") {
    return {
      configured: Boolean(process.env.OPENAI_API_KEY),
      status: "disabled",
      message:
        "Set VALIDATION_AGENT_ENABLED=true to run the OpenAI Agents SDK validation agent.",
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      configured: false,
      status: "not_configured",
      message: "OPENAI_API_KEY is required to run the validation agent.",
    };
  }

  try {
    const vesselContext = await getVesselContext();
    const augmentedPrompt = [
      "Backend vessel context available for this turn:",
      formatVesselContextForAgent(vesselContext),
      "User prompt:",
      prompt,
    ].join("\n\n");
    const result = await run(createValidationAgent(), augmentedPrompt, {
      maxTurns: 8,
    });
    return {
      configured: true,
      status: "completed",
      output: String(result.finalOutput ?? ""),
    };
  } catch (err) {
    return {
      configured: true,
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

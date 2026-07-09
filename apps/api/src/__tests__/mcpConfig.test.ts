import { describe, expect, test } from "@jest/globals";
import fs from "fs";
import path from "path";

describe("VS Code MCP config", () => {
  test("is valid JSON and keeps secrets environment-backed", () => {
    const configPath = path.resolve(process.cwd(), "../../.vscode/mcp.json");
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as {
      servers: Record<string, { env?: Record<string, string> }>;
    };

    expect(parsed.servers.firecrawl.env?.FIRECRAWL_API_KEY).toBe("${env:FIRECRAWL_API_KEY}");
    expect(parsed.servers.signalk.env?.SIGNALK_URL).toBe("${env:SIGNALK_URL}");
    expect(raw).not.toContain("your-signalk-server.local");
  });
});

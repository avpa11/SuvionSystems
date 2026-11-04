import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Workspace-local values take precedence; the root file supports npm workspace commands.
config();
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

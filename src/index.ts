import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./tools.js";

await createServer().connect(new StdioServerTransport());
console.error("file-server (stdio) running");
import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./tools.js";

const TOKEN = process.env.MCP_TOKEN;
const PORT = Number(process.env.PORT ?? 3000);
if (!TOKEN || TOKEN.length < 24) {
  console.error("MCP_TOKEN missing or too short (min 24 chars). Set it in .env");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// Token auth: Authorization: Bearer <token>
function authorized(header: string | undefined): boolean {
  const given = Buffer.from((header ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(TOKEN!);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

app.use("/mcp", (req, res, next) => {
  if (!authorized(req.headers.authorization)) {
    console.error(`[auth] rejected ${req.method} from ${req.ip}`);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

// Stateless: bagong server + transport kada request
app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  transport.onclose = () => {
    server.close();
  };
  res.on("close", () => {
    transport.close();
  });
  await server.connect(transport as any);
  await transport.handleRequest(req, res, req.body);
});

const notAllowed = (_req: express.Request, res: express.Response) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
};
app.get("/mcp", notAllowed);
app.delete("/mcp", notAllowed);

app.listen(PORT, "127.0.0.1", () => console.error(`file-server (http) on http://127.0.0.1:${PORT}/mcp`));
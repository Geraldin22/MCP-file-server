module.exports = {
  apps: [
    {
      name: "mcp-server",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/http.ts",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
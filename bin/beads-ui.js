#!/usr/bin/env node
const { spawn, exec } = require("child_process");
const path = require("path");
const net = require("net");

const serverEntry = path.join(__dirname, "../dist-server/index.js");

function findFreePort(start) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(start, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", () => findFreePort(start + 1).then(resolve, reject));
  });
}

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
}

(async () => {
  const port = await findFreePort(parseInt(process.env.PORT || "3001", 10));

  const server = spawn("node", [serverEntry], {
    env: {
      ...process.env,
      PROJECT_DIR: process.cwd(),
      PORT: String(port),
    },
    stdio: "inherit",
  });

  server.on("error", (err) => {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  });

  server.on("exit", (code) => process.exit(code ?? 0));

  setTimeout(() => {
    const url = `http://localhost:${port}`;
    console.log(`Opening ${url}`);
    openBrowser(url);
  }, 1200);
})();

import { spawn } from "node:child_process";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = ["backend", "frontend"].map((workspace) =>
  spawn(npm, ["run", "dev", "-w", workspace], {
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === "win32" && child.pid)
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    else child.kill("SIGTERM");
  }
  process.exitCode = code;
}
for (const child of children)
  child
    .on("exit", (code) => stop(code ?? 1))
    .on("error", (error) => {
      console.error(error.message);
      stop(1);
    });
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

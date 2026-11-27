import { createLockerServer } from "./app.js";
const server = createLockerServer();
const port = Number(process.env.PORT ?? 3001);
server.http.listen(port, "127.0.0.1", () =>
  console.log(`Smart Locker API: http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });

import { test } from "node:test";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { createLockerServer } from "../src/app.js";

test(
  "9 independent lockers (3x3), kiosk vending and realtime state",
  { timeout: 15000 },
  async () => {
    const server = createLockerServer({ enablePhpBridge: false });
    await new Promise<void>((r) => server.http.listen(0, "127.0.0.1", r));
    const address = server.http.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const socket = io(base, { transports: ["websocket"], autoConnect: false });
    try {
      const connected = new Promise<unknown>((resolve, reject) => {
        socket.once("status", resolve);
        socket.once("connect_error", reject);
      });
      socket.connect();
      await connected;
      async function get(path: string) {
        return (await fetch(base + path)).json();
      }
      async function post(path: string, body: unknown) {
        const r = await fetch(base + path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: r.status, data: await r.json() };
      }
      const initial = await get("/api/status");
      assert.equal(initial.lockers.length, 9);
      assert.equal(initial.rows, 3);
      assert.equal(initial.columns, 3);
      assert.deepEqual(
        initial.lockers
          .map((l: any) => l.id)
          .filter((id: string) => ["01", "09"].includes(id)),
        ["01", "09"],
      );
      const otp = await post("/api/lockers/03/otp/generate", {});
      assert.match(otp.data.code, /^\d{6}$/);
      assert.equal(
        (await post("/api/lockers/03/parcel", { parcel: "LOADED" })).status,
        409,
      );
      const publicStatus = await get("/api/status");
      assert.equal(publicStatus.lockers[2].otp.code, undefined);
      assert.equal(publicStatus.lockers[0].otp.active, false);
      assert.equal(
        (await post("/api/lockers/01/otp/verify", { code: otp.data.code }))
          .status,
        401,
      );
      const event = new Promise<any>((resolve) => socket.once("door", resolve));
      assert.equal(
        (await post("/api/lockers/03/otp/verify", { code: otp.data.code })).data
          .doorOpen,
        true,
      );
      assert.equal((await event).lockerId, "03");
      assert.equal(
        (await post("/api/lockers/03/otp/verify", { code: otp.data.code }))
          .status,
        409,
      );
      const deposited = await post("/api/lockers/03/parcel", {
        parcel: "LOADED",
      });
      assert.equal(deposited.data.parcel, "LOADED");
      assert.match(deposited.data.pickupOtp.code, /^\d{6}$/);
      assert.ok(
        !JSON.stringify(await get("/api/status")).includes(
          deposited.data.pickupOtp.code,
        ),
      );
      assert.equal(
        (await post("/api/lockers/03/door/close", {})).data.locked,
        true,
      );
      assert.equal(
        (
          await post("/api/lockers/03/otp/verify", {
            code: deposited.data.pickupOtp.code,
          })
        ).data.doorOpen,
        true,
      );
      assert.equal(
        (
          await post("/api/lockers/03/otp/verify", {
            code: deposited.data.pickupOtp.code,
          })
        ).status,
        409,
      );
      assert.equal(
        (await post("/api/lockers/03/parcel", { parcel: "EMPTY" })).data.parcel,
        "EMPTY",
      );
      await post("/api/lockers/03/door/close", {});
      assert.equal(
        (
          await post("/api/lockers/03/otp/verify", {
            code: deposited.data.pickupOtp.code,
          })
        ).status,
        401,
      );
      assert.equal((await get("/api/status")).lockers[0].parcel, "EMPTY");
      for (const [mode, target] of [
        ["COOL", 1],
        ["HEAT", 66],
        ["HEAT", "40"],
        ["BAD", 10],
      ])
        assert.equal(
          (await post("/api/lockers/01/temperature", { mode, target })).status,
          400,
        );
      assert.equal(
        (
          await post("/api/lockers/01/temperature", {
            mode: "COOL",
            target: 8,
          })
        ).data.polarity,
        -1,
      );
      assert.equal(
        (
          await post("/api/lockers/01/temperature", {
            mode: "HEAT",
            target: 55,
          })
        ).data.polarity,
        1,
      );
      assert.equal(
        (await post("/api/lockers/01/temperature", { mode: "OFF" })).data
          .polarity,
        0,
      );
      assert.equal((await get("/api/status")).lockers[0].mode, "OFF");
      const beforeStock = initial.vending.find(
        (v: any) => v.id === "water",
      ).stock;
      assert.equal(
        (await post("/api/vending/dispense", { id: "water" })).status,
        200,
      );
      assert.equal(
        (await get("/api/status")).vending.find((v: any) => v.id === "water")
          .stock,
        beforeStock - 1,
      );
      assert.equal(
        (await post("/api/vending/dispense", { id: "invalid" })).status,
        400,
      );
      assert.ok(
        !JSON.stringify(await get("/api/events")).includes(otp.data.code),
      );
      assert.ok(
        !JSON.stringify(await get("/api/events")).includes(
          deposited.data.pickupOtp.code,
        ),
      );
      assert.equal(
        (
          await fetch(base + "/api/lockers/01/otp/generate", {
            method: "POST",
            headers: { Origin: "https://evil.example" },
          })
        ).status,
        403,
      );
      const next = await post("/api/lockers/02/otp/generate", {});
      for (let i = 0; i < 5; i++)
        await post("/api/lockers/02/otp/verify", { code: "wrong" });
      assert.equal(
        (await post("/api/lockers/02/otp/generate", {})).status,
        429,
      );
      assert.equal(
        (await post("/api/lockers/02/otp/verify", { code: next.data.code }))
          .status,
        429,
      );
    } finally {
      socket.disconnect();
      await server.close();
    }
  },
);

test("door auto closes after deadline, manual close cancels pending timer", async () => {
  const server = createLockerServer({ autoCloseMs: 80, enablePhpBridge: false });
  await new Promise<void>((r) => server.http.listen(0, "127.0.0.1", r));
  const address = server.http.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const post = async (path: string, body = {}) => {
    const response = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    const p = "/api/lockers/01";
    let otp = await post(`${p}/otp/generate`);
    const opened = await post(`${p}/otp/verify`, { code: otp.code });
    assert.equal(opened.doorOpen, true);
    assert.ok(opened.autoCloseAt);
    await new Promise((r) => setTimeout(r, 130));
    let status = await (await fetch(`${base}/api/status`)).json();
    assert.equal(status.lockers[0].doorOpen, false);
    assert.equal(status.lockers[0].autoCloseAt, null);
    assert.ok(
      (await (await fetch(`${base}/api/events`)).json()).some(
        (e: { message: string }) => e.message.includes("tự đóng"),
      ),
    );
    otp = await post(`${p}/otp/generate`);
    await post(`${p}/otp/verify`, { code: otp.code });
    await post(`${p}/door/close`);
    await new Promise((r) => setTimeout(r, 130));
    status = await (await fetch(`${base}/api/status`)).json();
    assert.equal(status.lockers[0].doorOpen, false);
    assert.equal(status.lockers[0].autoCloseAt, null);
  } finally {
    await server.close();
  }
});

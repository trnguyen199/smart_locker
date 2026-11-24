import { test } from "node:test";
import assert from "node:assert/strict";
import { OtpService } from "../src/services/otp.ts";
import { SimpleThermalModel } from "../src/simulation/thermal.ts";
test("OTP has six digits and is consumed exactly once", () => {
  const o = new OtpService();
  const { code } = o.generate();
  assert.match(code, /^\d{6}$/);
  o.verify(code);
  assert.equal(o.status().active, false);
  assert.throws(() => o.verify(code));
});
test("OTP expires at five-minute boundary", () => {
  let now = 0;
  const o = new OtpService(() => now);
  const { code } = o.generate();
  now = 300000;
  assert.equal(o.status().active, false);
  assert.throws(() => o.verify(code));
});
test("five failures block for sixty seconds; regeneration cannot bypass block", () => {
  let now = 0;
  const o = new OtpService(() => now);
  const { code } = o.generate();
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.throws(() => o.verify(wrong));
  assert.equal(o.status().blockedUntil, 60000);
  assert.throws(() => o.generate());
  assert.throws(() => o.verify(code));
  now = 60000;
  o.verify(code);
  assert.equal(o.status().active, false);
});
test("replacement invalidates previous OTP and does not reset failed attempts", () => {
  const o = new OtpService();
  const first = o.generate();
  assert.throws(() => o.verify("bad"));
  const second = o.generate();
  assert.notEqual(first.code, second.code);
  assert.equal(o.status().attemptsRemaining, 4);
  assert.throws(() => o.verify(first.code));
  o.verify(second.code);
});
test("invalid payloads cannot unlock", () => {
  const o = new OtpService();
  o.generate();
  for (const value of [null, {}, 123456, undefined])
    assert.throws(() => o.verify(value));
});
test("COOL changes gradually and converges near target", () => {
  const t = new SimpleThermalModel();
  const first = t.step("COOL", 10, 1);
  assert.ok(first < 28 && first > 27);
  for (let i = 0; i < 1800; i++) t.step("COOL", 10, 1);
  assert.ok(Math.abs(t.temperature - 10) < 1);
});
test("HEAT warms gradually and converges near target", () => {
  const t = new SimpleThermalModel();
  assert.ok(t.step("HEAT", 40, 1) > 28);
  for (let i = 0; i < 1800; i++) t.step("HEAT", 40, 1);
  assert.ok(Math.abs(t.temperature - 40) < 1);
});
test("OFF returns toward ambient with residual thermal inertia", () => {
  const t = new SimpleThermalModel();
  for (let i = 0; i < 100; i++) t.step("HEAT", 40, 1);
  const before = t.temperature;
  t.step("OFF", 40, 1);
  assert.ok(Math.abs(t.temperature - before) < 1);
  for (let i = 0; i < 4000; i++) t.step("OFF", 40, 1);
  assert.ok(Math.abs(t.temperature - 28) < 0.1);
});
test("large time steps are bounded and temperature is finite", () => {
  const t = new SimpleThermalModel();
  t.step("HEAT", 45, 99999);
  assert.ok(Number.isFinite(t.temperature));
  assert.ok(t.temperature < 29);
});
test("changing polarity preserves temperature continuity", () => {
  const t = new SimpleThermalModel();
  for (let i = 0; i < 100; i++) t.step("HEAT", 40, 1);
  const before = t.temperature;
  t.step("COOL", 10, 1);
  assert.ok(Math.abs(t.temperature - before) < 0.5);
  for (let i = 0; i < 1800; i++) t.step("COOL", 10, 1);
  assert.ok(Math.abs(t.temperature - 10) < 1);
});
test("opening door increases exchange with ambient", () => {
  const closed = new SimpleThermalModel();
  const opened = new SimpleThermalModel();
  closed.temperature = 10;
  opened.temperature = 10;
  closed.step("OFF", 10, 1, false);
  opened.step("OFF", 10, 1, true);
  assert.ok(opened.temperature > closed.temperature);
});
test("zero or invalid elapsed time cannot change temperature", () => {
  const t = new SimpleThermalModel();
  t.step("COOL", 10, 0);
  assert.equal(t.temperature, 28);
  t.step("HEAT", 40, NaN);
  assert.equal(t.temperature, 28);
});

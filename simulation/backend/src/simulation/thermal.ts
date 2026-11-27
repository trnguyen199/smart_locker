import type { Mode } from "../../../shared/types.js";
export interface ThermalModel {
  temperature: number;
  power: number;
  step(mode: Mode, target: number, dt: number, doorOpen?: boolean): number;
}
export class SimpleThermalModel implements ThermalModel {
  temperature = 28;
  power = 0;
  constructor(public ambient = 28) {}
  step(mode: Mode, target: number, dt: number, doorOpen = false): number {
    dt = Number.isFinite(dt) ? Math.min(2, Math.max(0, dt)) : 0;
    const leak = doorOpen ? 0.025 : 0.006;
    const requested =
      mode === "OFF"
        ? 0
        : Math.max(
            -1,
            Math.min(
              1,
              ((target - this.temperature) * 0.07 -
                leak * (this.ambient - this.temperature)) /
                0.22,
            ),
          );
    const directional =
      mode === "COOL"
        ? Math.min(0, requested)
        : mode === "HEAT"
          ? Math.max(0, requested)
          : 0;
    this.power += (directional - this.power) * (1 - Math.exp(-dt / 5));
    this.temperature +=
      (leak * (this.ambient - this.temperature) + 0.22 * this.power) * dt;
    return this.temperature;
  }
}

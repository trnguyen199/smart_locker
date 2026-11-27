export type Mode = "COOL" | "HEAT" | "OFF";
export type Parcel = "EMPTY" | "LOADED";

export interface LockerEvent {
  id: number;
  at: number;
  lockerId: string;
  type: string;
  message: string;
}

export interface GpioPinMap {
  servo_gpio: number;
  door_switch_gpio: number;
  ds18b20_gpio: number;
  relay_gpio: number | null;
}

export interface LockerStatus {
  id: string;
  slot: number;
  lockerType: "THERMAL" | "COOL" | "NORMAL";
  backendStatus: string;
  nodeId: 1 | 2 | 3;
  gpio: GpioPinMap;
  row: number;
  column: number;
  temperature: number;
  ambient: number;
  target: number;
  mode: Mode;
  polarity: -1 | 0 | 1;
  power: number;
  fan: boolean;
  doorOpen: boolean;
  autoCloseAt: number | null;
  locked: boolean;
  parcel: Parcel;
  otp: {
    active: boolean;
    expiresAt: number | null;
    blockedUntil: number | null;
    attemptsRemaining: number;
  };
}

export interface BankStatus {
  revision: number;
  serverTime: number;
  rows: number;
  columns: number;
  phpConnected: boolean;
  mqttConnected: boolean;
  mqttTopicPrefix: string;
  wokwiNodes: number[];
  lockers: LockerStatus[];
  vending: {
    id: string;
    name: string;
    kind: "DRINK" | "SNACK";
    stock: number;
  }[];
}

export interface HardwareSlotInfo {
  slot: number;
  code: string;
  type: "COOL" | "NORMAL";
  gpio: {
    type: string;
    servo_gpio: number;
    door_switch_gpio: number;
    ds18b20_gpio: number;
    relay_gpio: number | null;
  };
  signals: {
    servo_angle: number;
    door_switch: string;
    ds18b20_temp: number;
    target_temp: number;
    relay_active: boolean;
    pwm_power: number;
    status: string;
  };
}

export interface WokwiPart {
  id: string;
  type: string;
  top: number;
  left: number;
  attrs?: Record<string, string>;
}

export type WokwiConnection = [string, string, string, string[]?];

export interface HardwareNodeInfo {
  node: number;
  title: string;
  diagram_path: string;
  diagram_exists: boolean;
  parts_count: number;
  connections_count: number;
  part_summary: Record<string, number>;
  diagram?: {
    parts: WokwiPart[];
    connections: WokwiConnection[];
  };
  slots: HardwareSlotInfo[];
}

export interface HardwareInfoResponse {
  ok: boolean;
  circuit_summary: {
    diagrams_present: boolean;
    diagram_count: number;
    firmware_present: boolean;
    firmware_files: string[];
    note: string;
  };
  nodes: HardwareNodeInfo[];
  server_time: string;
}

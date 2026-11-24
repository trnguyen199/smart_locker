export type Mode = "COOL" | "HEAT" | "OFF";
export type Parcel = "EMPTY" | "LOADED";
export interface LockerEvent {
  id: number;
  at: number;
  lockerId: string;
  type: string;
  message: string;
}
export interface LockerStatus {
  id: string;
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
  lockers: LockerStatus[];
  vending: {
    id: string;
    name: string;
    kind: "DRINK" | "SNACK";
    stock: number;
  }[];
}

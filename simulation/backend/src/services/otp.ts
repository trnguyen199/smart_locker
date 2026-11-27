import { randomInt, createHash, timingSafeEqual } from "node:crypto";
export class DomainError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}
export class OtpService {
  private digest: Buffer | null = null;
  private expiresAt = 0;
  private failures = 0;
  private blockedUntil = 0;
  constructor(public now: () => number = Date.now) {}
  private refresh() {
    if (this.blockedUntil && this.now() >= this.blockedUntil) {
      this.blockedUntil = 0;
      this.failures = 0;
    }
    if (this.now() >= this.expiresAt) this.digest = null;
  }
  private guard() {
    this.refresh();
    if (this.blockedUntil > this.now())
      throw new DomainError(
        "Tạm khóa xác thực 60 giây. Hãy chờ bộ đếm kết thúc.",
        429,
      );
  }
  generate() {
    this.guard();
    let code: string;
    let hash: Buffer;
    do {
      code = randomInt(0, 1_000_000).toString().padStart(6, "0");
      hash = createHash("sha256").update(code).digest();
    } while (this.digest?.equals(hash));
    this.digest = hash;
    this.expiresAt = this.now() + 300_000;
    return { code, expiresAt: this.expiresAt };
  }
  verify(code: unknown) {
    this.guard();
    if (!this.digest)
      throw new DomainError("OTP không còn hiệu lực. Hãy tạo mã mới.", 401);
    const valid =
      typeof code === "string" &&
      /^\d{6}$/.test(code) &&
      timingSafeEqual(createHash("sha256").update(code).digest(), this.digest);
    if (!valid) {
      this.failures++;
      if (this.failures >= 5) {
        this.blockedUntil = this.now() + 60_000;
        throw new DomainError(
          "Sai 5 lần. Tạm khóa xác thực trong 60 giây.",
          429,
        );
      }
      throw new DomainError(
        `OTP không đúng. Còn ${5 - this.failures} lần thử.`,
        401,
      );
    }
    this.digest = null;
    this.failures = 0;
    this.expiresAt = 0;
  }
  status() {
    this.refresh();
    return {
      active: !!this.digest,
      expiresAt: this.digest ? this.expiresAt : null,
      blockedUntil: this.blockedUntil > this.now() ? this.blockedUntil : null,
      attemptsRemaining: Math.max(0, 5 - this.failures),
    };
  }
}

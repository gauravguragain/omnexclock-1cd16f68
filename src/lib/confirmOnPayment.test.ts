import { describe, expect, it } from "vitest";
import { shouldConfirmOnPayment } from "./confirmOnPayment";

describe("shouldConfirmOnPayment", () => {
  it("confirms a pending booking once a deposit is recorded", () => {
    expect(shouldConfirmOnPayment("pending_confirmation", 500)).toBe(true);
  });
  it("leaves a pending booking pending when nothing has been paid", () => {
    expect(shouldConfirmOnPayment("pending_confirmation", 0)).toBe(false);
  });
  it("never revives cancelled or declined bookings", () => {
    expect(shouldConfirmOnPayment("cancelled", 500)).toBe(false);
    expect(shouldConfirmOnPayment("declined", 500)).toBe(false);
  });
});

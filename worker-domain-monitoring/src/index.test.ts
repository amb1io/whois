import { describe, expect, it, vi } from "vitest";
import handler from "./index";

type MockEnv = Parameters<typeof handler.scheduled>[1];

type MockExecutionContext = ExecutionContext & {
  waitUntil: ReturnType<typeof vi.fn>;
};

const baseEnv = Object.freeze({
  MAILERSEND_API_URL: "https://api.mailersend.com/v1/email",
  MAILERSEND_API_KEY: process.env.MAILERSEND_API_KEY ?? "key",
  NOTIFICATION_FROM_EMAIL: "whois-test@amb1.io",
  NOTIFICATION_FROM_NAME: "Domain Alert",
  FIXED_RECIPIENT_EMAIL: "rhamses.soares@gmail.com",
});

describe("domain monitoring worker", () => {
  it("returns health status from fetch", async () => {
    const response = await handler.fetch!(new Request("http://localhost/"), {
      ...baseEnv,
      domain_monitor: {} as unknown as D1Database,
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.mailerSendConfigured).toBe(true);
    expect(data.forcedRecipient).toBe(baseEnv.FIXED_RECIPIENT_EMAIL);
  });

  it("sends notifications for expiring domains", async () => {
    const mockPrepare = vi.fn(() => ({
      bind: () => ({
        all: () =>
          Promise.resolve({
            results: [
              {
                email: "user@example.com",
                domain: "example.com",
                expires_at: new Date().toISOString(),
              },
            ],
          }),
      }),
    }));

    const mockEnv: MockEnv = {
      ...baseEnv,
      domain_monitor: {
        prepare: mockPrepare,
      } as unknown as D1Database,
    };

    const waitUntil = vi.fn();
    const mockExecutionContext = {
      waitUntil,
      passThroughOnException: () => {},
    } as MockExecutionContext;

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));

    await handler.scheduled!(
      {
        type: "scheduled",
        scheduledTime: Date.now(),
        cron: "",
      } as ScheduledEvent,
      mockEnv,
      mockExecutionContext
    );

    expect(waitUntil).toHaveBeenCalled();
    const promise = waitUntil.mock.calls[0]?.[0];
    expect(promise).toBeInstanceOf(Promise);
    await promise;
    expect(fetchSpy).toHaveBeenCalledWith(
      baseEnv.MAILERSEND_API_URL,
      expect.objectContaining({ method: "POST" })
    );

    fetchSpy.mockRestore();
  });
});

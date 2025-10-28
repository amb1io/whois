import { beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./index";

type MockEnv = Parameters<typeof handler.scheduled>[1];

type MockExecutionContext = ExecutionContext & {
  waitUntil: ReturnType<typeof vi.fn>;
};

const MAILERSEND_API_URL = "https://api.mailersend.com/v1/email";
const FIXED_RECIPIENT_EMAIL = "rhamses.soares@gmail.com";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("domain monitoring worker", () => {
  it("returns health status from fetch", async () => {
    const env = await createBaseEnv();
    const response = await handler.fetch!(new Request("http://localhost/"), {
      ...env,
      domain_monitor: {} as unknown as D1Database,
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.mailerSendConfigured).toBe(true);
    expect(data.forcedRecipient).toBe(FIXED_RECIPIENT_EMAIL);
  });

  it("sends notifications for expiring domains", async () => {
    const subscription = await createSubscriptionKeys();
    const mockPrepare = vi.fn(() => ({
      bind: () => ({
        all: () =>
          Promise.resolve({
            results: [
              {
                email: "user@example.com",
                domain: "example.com",
                expires_at: new Date().toISOString(),
                endpoint: subscription.endpoint,
                auth: subscription.auth,
                p256dh: subscription.p256dh,
              },
            ],
          }),
      }),
    }));

    const baseEnv = await createBaseEnv();
    expect(baseEnv.WEB_PUSH_VAPID_PUBLIC_KEY).toBeDefined();
    expect(baseEnv.WEB_PUSH_VAPID_PRIVATE_KEY).toBeDefined();
    expect(baseEnv.WEB_PUSH_VAPID_SUBJECT).toBeDefined();

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
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
      MAILERSEND_API_URL,
      expect.objectContaining({ method: "POST" })
    );

    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(errorSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

async function createBaseEnv() {
  const vapid = await createVapidKeys();
  return Object.freeze({
    MAILERSEND_API_URL,
    MAILERSEND_API_KEY: process.env.MAILERSEND_API_KEY ?? "key",
    NOTIFICATION_FROM_EMAIL: "whois-test@amb1.io",
    NOTIFICATION_FROM_NAME: "Domain Alert",
    FIXED_RECIPIENT_EMAIL,
    WEB_PUSH_VAPID_PUBLIC_KEY: vapid.publicKey,
    WEB_PUSH_VAPID_PRIVATE_KEY: vapid.privateKey,
    WEB_PUSH_VAPID_SUBJECT: vapid.subject,
  });
}

async function createVapidKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const privateKeyJwk = (await crypto.subtle.exportKey("jwk", keyPair.privateKey)) as JsonWebKey;
  if (!privateKeyJwk.d) {
    throw new Error("Failed to export VAPID private key.");
  }
  return {
    publicKey: encodeBase64Url(publicKey),
    privateKey: privateKeyJwk.d,
    subject: "mailto:test@example.com",
  };
}

async function createSubscriptionKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    endpoint: "https://push.example.com/subscription",
    auth: encodeBase64Url(auth),
    p256dh: encodeBase64Url(publicKey),
  };
}

function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

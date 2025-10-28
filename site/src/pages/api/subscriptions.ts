import type { APIRoute } from "astro";
import { getPrismaClient } from "../../lib/prisma";

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });

export const prerender = false;

if (typeof globalThis.exports === "undefined") {
  const cjsModule = { exports: {} };
  (globalThis as typeof globalThis & { exports: unknown; module: unknown }).exports = cjsModule.exports;
  (globalThis as typeof globalThis & { module: unknown }).module = cjsModule;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const prisma = await getPrismaClient(locals.runtime?.env?.domain_monitor);

  if (!prisma) {
    return jsonResponse({ error: "Database is not available." }, 503);
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }

  const domain: string | null = payload?.domain ? String(payload.domain).toLowerCase() : null;
  const notifyChanges = Boolean(payload?.notifyChanges);
  const notifyExpiry = Boolean(payload?.notifyExpiry);
  const subscription = payload?.subscription ?? null;
  const emailRaw = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : null;

  if (!notifyChanges && !notifyExpiry) {
    return jsonResponse({ error: "Select at least one notification option." }, 400);
  }

  if (!domain) {
    return jsonResponse({ error: "Domain is required." }, 400);
  }

  if (!emailRaw) {
    return jsonResponse({
      error: "An email address is required to save notification preferences."
    }, 400);
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(emailRaw)) {
    return jsonResponse({ error: "Invalid email address." }, 400);
  }

  const hasSubscription = Boolean(
    subscription?.endpoint &&
      subscription?.keys?.p256dh &&
      subscription?.keys?.auth
  );

  if (!hasSubscription) {
    return jsonResponse({ error: "Push subscription details are incomplete." }, 400);
  }

  try {
    let domainRecord = await prisma.domain.findFirst({
      where: { domain }
    });

    if (!domainRecord) {
      domainRecord = await prisma.domain.create({
        data: { domain }
      });
    }

    const user = await prisma.user.upsert({
      where: { email: emailRaw },
      update: {},
      create: { email: emailRaw }
    });

    await prisma.subscription.upsert({
      where: {
        endpoint_domainId_userId: {
          endpoint: String(subscription.endpoint),
          domainId: domainRecord.id,
          userId: user.id
        }
      },
      update: {
        auth: String(subscription.keys.auth),
        p256dh: String(subscription.keys.p256dh),
        notifyChanges,
        notifyExpiry,
        userRead: false,
        domainNotify: false,
        domainId: domainRecord.id,
        userId: user.id
      },
      create: {
        endpoint: String(subscription.endpoint),
        auth: String(subscription.keys.auth),
        p256dh: String(subscription.keys.p256dh),
        domainId: domainRecord.id,
        userId: user.id,
        notifyChanges,
        notifyExpiry,
        userRead: false,
        domainNotify: false
      }
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("Failed to store subscription:", error);
    return jsonResponse({ error: "Unable to store subscription." }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const prisma = await getPrismaClient(locals.runtime?.env?.domain_monitor);

  if (!prisma) {
    return jsonResponse({ error: "Database is not available." }, 503);
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }

  const domain: string | null = payload?.domain ? String(payload.domain).toLowerCase() : null;
  const endpoint = payload?.endpoint ? String(payload.endpoint) : null;

  if (!domain || !endpoint) {
    return jsonResponse({ error: "Domain and endpoint are required." }, 400);
  }

  try {
    await prisma.subscription.delete({
      where: {
        endpoint_domain: {
          endpoint,
          domain
        }
      }
    });
  } catch (error) {
    console.error("Failed to remove subscription:", error);
    return jsonResponse({ error: "Unable to remove subscription." }, 500);
  }

  return jsonResponse({ ok: true });
};

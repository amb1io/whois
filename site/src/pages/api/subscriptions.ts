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

export const GET: APIRoute = async ({ request, locals }) => {
  const prisma = await getPrismaClient(locals.runtime?.env?.domain_monitor);

  if (!prisma) {
    return jsonResponse({ error: "Database is not available." }, 503);
  }

  const url = new URL(request.url);
  const auth = url.searchParams.get("auth");

  if (!auth) {
    return jsonResponse({ error: "The auth parameter is required." }, 400);
  }

  try {
    const subscriptions = await prisma.subscription.findMany({
      where: {
        auth,
        domainNotify: true
      },
      include: {
        domain: {
          select: {
            domain: true,
            expiresAt: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    const notifications = subscriptions.map((item) => {
      const message = item.notifyExpiry
        ? "Domain expiration approaching."
        : item.notifyChanges
        ? "WHOIS details were updated."
        : "Domain update available.";

      return {
        id: item.id,
        domain: item.domain?.domain ?? null,
        notifyChanges: item.notifyChanges,
        notifyExpiry: item.notifyExpiry,
        domainNotify: item.domainNotify,
        userRead: item.userRead,
        message,
        updatedAt: item.updatedAt?.toISOString?.() ?? null
      };
    });

    return jsonResponse({ ok: true, notifications });
  } catch (error) {
    console.error("Failed to retrieve notifications:", error);
    return jsonResponse({ error: "Unable to load notifications." }, 500);
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
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

  const idRaw = payload?.id;
  const auth =
    typeof payload?.auth === "string" ? payload.auth.trim() : null;

  const idNumber = Number(idRaw);
  if (!Number.isInteger(idNumber) || idNumber <= 0) {
    return jsonResponse({ error: "A valid notification id is required." }, 400);
  }

  const where: Record<string, unknown> = { id: idNumber };
  if (auth) {
    where.auth = auth;
  }

  try {
    const result = await prisma.subscription.updateMany({
      where,
      data: {
        domainNotify: false,
        userRead: true,
      },
    });

    if (result.count === 0) {
      return jsonResponse({ error: "Notification not found." }, 404);
    }

    return jsonResponse({ ok: true, updated: result.count });
  } catch (error) {
    console.error("Failed to update notification:", error);
    return jsonResponse({ error: "Unable to update notification." }, 500);
  }
};

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

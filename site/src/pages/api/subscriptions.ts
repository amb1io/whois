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

  if (!domain) {
    return jsonResponse({ error: "Domain is required." }, 400);
  }

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return jsonResponse({ error: "Push subscription details are incomplete." }, 400);
  }

  try {
    await prisma.subscription.upsert({
      where: {
        endpoint_domain: {
          endpoint: String(subscription.endpoint),
          domain
        }
      },
      update: {
        auth: String(subscription.keys.auth),
        p256dh: String(subscription.keys.p256dh),
        notifyChanges,
        notifyExpiry
      },
      create: {
        endpoint: String(subscription.endpoint),
        auth: String(subscription.keys.auth),
        p256dh: String(subscription.keys.p256dh),
        domain,
        notifyChanges,
        notifyExpiry
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

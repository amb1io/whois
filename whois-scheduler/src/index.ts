import { syncNotifySubscriptions } from "./sync-notify";
import { syncRdapBootstrap } from "./sync";

export default {
  async fetch(): Promise<Response> {
    return Response.json(
      {
        error:
          "whois-scheduler is a cron-only worker. Use whois-api-search for /search and /notify.",
      },
      { status: 405 }
    );
  },
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(
      Promise.all([syncRdapBootstrap(env), syncNotifySubscriptions(env)])
    );
  },
};

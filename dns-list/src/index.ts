import { syncNotifySubscriptions } from "./sync-notify";
import { syncRdapBootstrap } from "./sync";

export default {
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

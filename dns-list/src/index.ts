import { syncRdapBootstrap } from "./sync";

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(syncRdapBootstrap(env));
  },
};

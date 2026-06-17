import { Hono } from "hono";
import { cors } from "hono/cors";
import { notifyRoute } from "./routes/notify";
import { searchRoute } from "./routes/search";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["POST", "OPTIONS"],
    exposeHeaders: ["X-Cache"],
    maxAge: 86400,
  })
);

app.route("/", searchRoute);
app.route("/", notifyRoute);

export default app;

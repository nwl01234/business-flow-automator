import { serve } from "@hono/node-server";
import { createApp } from "./http.ts";

const port = Number(process.env.PORT ?? "3100");

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`node-service listening on http://127.0.0.1:${info.port}`);
});

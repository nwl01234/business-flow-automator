import { createMiddleware } from "hono/factory";
import { sign, verify } from "hono/jwt";
import type { AuthUser, Role, User } from "./domain.ts";
import { AppError } from "./errors.ts";

export type Env = { Variables: { user: AuthUser } };

const SECRET = process.env.JWT_SECRET ?? "node-service-dev-secret";
const TTL_SECONDS = 60 * 60;

export async function issueToken(user: User): Promise<string> {
  return sign(
    { sub: user.login, role: user.role, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS },
    SECRET,
  );
}

export const auth = createMiddleware<Env>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    throw new AppError(401, "unauthorized", "Bearer token required");
  }
  try {
    const payload = await verify(header.slice(7), SECRET, "HS256");
    const login = payload["sub"];
    const role = payload["role"];
    if (typeof login !== "string" || (role !== "admin" && role !== "manager")) {
      throw new Error("invalid claims");
    }
    c.set("user", { login, role });
  } catch {
    throw new AppError(401, "unauthorized", "invalid or expired token");
  }
  await next();
});

export function requireRole(...roles: Role[]) {
  return createMiddleware<Env>(async (c, next) => {
    const user = c.get("user");
    if (!roles.includes(user.role)) {
      throw new AppError(403, "forbidden", "insufficient role");
    }
    await next();
  });
}

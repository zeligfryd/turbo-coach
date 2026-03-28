import { createHmac, timingSafeEqual } from "crypto";

function getSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET ?? process.env.STRAVA_CLIENT_SECRET;
  if (!secret) throw new Error("OAUTH_STATE_SECRET is not set");
  return secret;
}

/** Sign a userId into a tamper-proof state string. */
export function signOAuthState(userId: string): string {
  const sig = createHmac("sha256", getSecret()).update(userId).digest("hex");
  return `${userId}.${sig}`;
}

/** Verify and extract userId from the state string. Returns null if invalid. */
export function verifyOAuthState(state: string): string | null {
  const dotIndex = state.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const userId = state.slice(0, dotIndex);
  const sig = state.slice(dotIndex + 1);
  const expected = createHmac("sha256", getSecret()).update(userId).digest("hex");

  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  return userId;
}

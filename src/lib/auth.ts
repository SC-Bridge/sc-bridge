import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import type { Env } from "./types";
import { sendEmail } from "./email";

export function createAuth(env: Env) {
  return betterAuth({
    database: {
      dialect: new D1Dialect({ database: env.DB }),
      type: "sqlite" as const,
    },
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(
          env,
          user.email,
          "Reset your password",
          `<p>Click <a href="${url}">here</a> to reset your password.</p>`,
        );
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Refresh daily
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 min cache
      },
    },
    trustedOrigins: [env.BETTER_AUTH_URL],
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
            },
          }
        : {}),
      ...(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET
        ? {
            discord: {
              clientId: env.DISCORD_CLIENT_ID,
              clientSecret: env.DISCORD_CLIENT_SECRET,
            },
          }
        : {}),
      ...(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET
        ? {
            twitch: {
              clientId: env.TWITCH_CLIENT_ID,
              clientSecret: env.TWITCH_CLIENT_SECRET,
            },
          }
        : {}),
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

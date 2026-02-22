import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import { admin } from "better-auth/plugins/admin";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import type { Env } from "./types";
import { sendEmail } from "./email";

// Access control: extend default admin statements with app-specific resources
const ac = createAccessControl({
  ...defaultStatements,
  fleet: ["view", "import", "delete"],
  analysis: ["view", "generate"],
  sync: ["view", "trigger"],
});

const superAdminRole = ac.newRole({
  user: ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"],
  session: ["list", "revoke", "delete"],
  fleet: ["view", "import", "delete"],
  analysis: ["view", "generate"],
  sync: ["view", "trigger"],
});

const adminRole = ac.newRole({
  user: ["create", "list", "ban", "get"],
  session: ["list", "revoke"],
  fleet: ["view", "import", "delete"],
  analysis: ["view", "generate"],
  sync: ["view", "trigger"],
});

const userRole = ac.newRole({
  user: [],
  session: [],
  fleet: ["view", "import"],
  analysis: ["view", "generate"],
});

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
    plugins: [
      admin({
        ac,
        roles: {
          super_admin: superAdminRole,
          admin: adminRole,
          user: userRole,
        },
        defaultRole: "user",
        adminRoles: ["admin", "super_admin"],
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

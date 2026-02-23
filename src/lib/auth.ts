import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { D1Dialect } from "kysely-d1";
import { admin } from "better-auth/plugins/admin";
import { twoFactor } from "better-auth/plugins/two-factor";
import { passkey } from "@better-auth/passkey";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import type { Env } from "./types";
import { sendEmail, buildTransactionalEmailHtml } from "./email";
import { hashPassword, verifyPassword } from "./password";
import { escapeHtml } from "./utils";
import { logUserChange } from "./change-history";

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

// Cache auth instance per isolate — avoids reconstructing on every request.
// WeakMap keyed on the D1 binding ensures the cache is scoped to the env.
const authCache = new WeakMap<D1Database, ReturnType<typeof betterAuth>>();

export function createAuth(env: Env) {
  const cached = authCache.get(env.DB);
  if (cached) return cached;

  const auth = betterAuth({
    database: {
      dialect: new D1Dialect({ database: env.DB }),
      type: "sqlite" as const,
    },
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: hashPassword,
        verify: ({ password, hash }) => verifyPassword(password, hash),
      },
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(
          env,
          user.email,
          "Reset your password",
          buildTransactionalEmailHtml("Reset Your Password", `
            <p>We received a request to reset the password for your SC Bridge account.</p>
            <p>Click the button below to choose a new password:</p>
            <p style="text-align:center;"><a href="${url}" class="cta">Reset Password</a></p>
            <p style="font-size:12px;color:#888;">If you didn't request this, you can safely ignore this email. Your password won't be changed.</p>
          `),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const isEmailChange = user.emailVerified === true;
        if (isEmailChange) {
          await sendEmail(
            env,
            user.email,
            "Verify your new email",
            buildTransactionalEmailHtml("Verify New Email", `
              <p>Click the button below to confirm <strong>${escapeHtml(user.email)}</strong> as your new SC Bridge email address.</p>
              <p style="text-align:center;"><a href="${url}" class="cta">Verify New Email</a></p>
              <p style="font-size:12px;color:#888;">If you didn't request this change, you can safely ignore this email.</p>
            `),
          );
        } else {
          await sendEmail(
            env,
            user.email,
            "Verify your email",
            buildTransactionalEmailHtml("Verify Your Email", `
              <p>Welcome to SC Bridge! Please verify your email address to activate your account.</p>
              <p>Click the button below to get started:</p>
              <p style="text-align:center;"><a href="${url}" class="cta">Verify Email</a></p>
              <p style="font-size:12px;color:#888;">If you didn't create an SC Bridge account, you can safely ignore this email.</p>
            `),
          );
        }
      },
    },
    // NOTE: Memory-based rate limiting is per-isolate on Workers (resets on cold start,
    // not shared across colos). This provides basic protection but is not globally
    // effective. Use Cloudflare WAF rate limiting rules for production brute-force defense.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 10,
      storage: "memory",
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Refresh daily
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 min cache
      },
    },
    user: {
      changeEmail: {
        enabled: true,
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
      ...(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_OAUTH_CLIENT_ID,
              clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
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
        trustedProviders: ["google", "discord", "github", "twitch"],
      },
    },
    databaseHooks: {
      account: {
        create: {
          after: async (account, context) => {
            const rec = account as Record<string, unknown>;
            const providerId = rec.providerId as string | undefined;
            const userId = rec.userId as string | undefined;
            if (userId && providerId && providerId !== "credential") {
              const ip = context?.headers?.get("cf-connecting-ip") ?? context?.headers?.get("x-forwarded-for");
              await logUserChange(env.DB, userId, "provider_linked", {
                providerId,
                newValue: providerId,
                ipAddress: ip ?? undefined,
              });
            }
          },
        },
      },
      session: {
        delete: {
          after: async (session, context) => {
            const userId = (session as Record<string, unknown>).userId as string | undefined;
            if (userId) {
              const ip = context?.headers?.get("cf-connecting-ip") ?? context?.headers?.get("x-forwarded-for");
              await logUserChange(env.DB, userId, "session_revoked", {
                ipAddress: ip ?? undefined,
              });
            }
          },
        },
      },
      user: {
        update: {
          after: async (user, context) => {
            const record = user as Record<string, unknown>;
            const userId = record.id as string | undefined;
            if (!userId) return;
            const ip = context?.headers?.get("cf-connecting-ip") ?? context?.headers?.get("x-forwarded-for");
            // Check for email change
            if (record.email !== undefined) {
              await logUserChange(env.DB, userId, "email_changed", {
                fieldName: "email",
                newValue: record.email as string,
                ipAddress: ip ?? undefined,
              });
            }
            // Check for name/profile change
            if (record.name !== undefined) {
              await logUserChange(env.DB, userId, "profile_updated", {
                fieldName: "name",
                newValue: record.name as string,
                ipAddress: ip ?? undefined,
              });
            }
          },
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const path = ctx.path;
        const TRACKED_PATHS = new Set([
          "/two-factor/enable",
          "/two-factor/disable",
          "/change-password",
          "/passkey/add-passkey",
          "/passkey/delete-passkey",
          "/passkey/update-passkey",
        ]);
        if (!TRACKED_PATHS.has(path)) return;

        // Only log on successful responses
        const returned = ctx.context?.returned;
        if (returned && typeof returned === "object" && "status" in returned) {
          const status = (returned as { status?: number }).status;
          if (status && status >= 400) return;
        }

        const session = ctx.context?.session;
        const userId = session?.user?.id;
        if (!userId) return;

        const ip = ctx.headers?.get("cf-connecting-ip") ?? ctx.headers?.get("x-forwarded-for");
        const ipAddress = ip ?? undefined;

        if (path === "/two-factor/enable") {
          await logUserChange(env.DB, userId, "2fa_enabled", {
            fieldName: "2fa",
            newValue: "enabled",
            ipAddress,
          });
        } else if (path === "/two-factor/disable") {
          await logUserChange(env.DB, userId, "2fa_disabled", {
            fieldName: "2fa",
            oldValue: "enabled",
            newValue: "disabled",
            ipAddress,
          });
        } else if (path === "/change-password") {
          await logUserChange(env.DB, userId, "password_changed", {
            providerId: "credential",
            newValue: "[changed]",
            ipAddress,
          });
        } else if (path === "/passkey/add-passkey") {
          await logUserChange(env.DB, userId, "passkey_added", {
            fieldName: "passkey",
            newValue: "[added]",
            ipAddress,
          });
        } else if (path === "/passkey/delete-passkey") {
          await logUserChange(env.DB, userId, "passkey_removed", {
            fieldName: "passkey",
            oldValue: "[removed]",
            ipAddress,
          });
        } else if (path === "/passkey/update-passkey") {
          await logUserChange(env.DB, userId, "passkey_renamed", {
            fieldName: "passkey",
            newValue: "[renamed]",
            ipAddress,
          });
        }
      }),
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
      twoFactor({
        issuer: "SC Bridge",
        totpOptions: {
          digits: 6,
          period: 30,
        },
        backupCodeOptions: {
          amount: 10,
          length: 10,
        },
      }),
      passkey({
        rpID: new URL(env.BETTER_AUTH_URL).hostname,
        rpName: "SC Bridge",
        origin: env.BETTER_AUTH_URL,
      }),
    ],
  });

  authCache.set(env.DB, auth);
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;

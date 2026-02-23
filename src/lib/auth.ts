import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import { admin } from "better-auth/plugins/admin";
import { twoFactor } from "better-auth/plugins/two-factor";
import { passkey } from "@better-auth/passkey";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import type { Env } from "./types";
import { sendEmail, buildTransactionalEmailHtml } from "./email";
import { hashPassword, verifyPassword } from "./password";

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
      },
    },
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
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          await sendEmail(
            env,
            user.email,
            "Confirm email change",
            buildTransactionalEmailHtml("Confirm Email Change", `
              <p>We received a request to change your SC Bridge email to <strong>${newEmail}</strong>.</p>
              <p>Click the button below to confirm this change:</p>
              <p style="text-align:center;"><a href="${url}" class="cta">Confirm Email Change</a></p>
              <p style="font-size:12px;color:#888;">If you didn't request this, you can safely ignore this email.</p>
            `),
          );
        },
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
}

export type Auth = ReturnType<typeof createAuth>;

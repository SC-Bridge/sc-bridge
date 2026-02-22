import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [
    adminClient(),
    twoFactorClient({
      onTwoFactorRedirect: () => {
        window.location.href = "/2fa";
      },
    }),
    passkeyClient(),
  ],
});

export const {
  useSession,
  signIn,
  signUp,
  signOut,
} = authClient;

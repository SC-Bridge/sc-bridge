import { createAuthClient } from "better-auth/react";
import { adminClient, magicLinkClient, twoFactorClient, organizationClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [
    adminClient(),
    magicLinkClient(),
    twoFactorClient({
      onTwoFactorRedirect: () => {
        window.location.href = "/2fa";
      },
    }),
    passkeyClient(),
    organizationClient(),
  ],
});

export const {
  useSession,
  signIn,
  signUp,
  signOut,
} = authClient;

# Authentication Provider Research for Cloudflare Workers App

**Context:** Fleet Manager rewrite on Cloudflare Workers (Hono framework, D1 database, React SPA frontend). Currently single-user, needs multi-user auth with email/password, OAuth SSO (Google, GitHub, Facebook, Twitch), 2FA (TOTP), passkeys/WebAuthn, RBAC (user, admin, super_admin), and an admin panel for user management.

**Scale:** Small personal project, 1-50 users. Must work on Cloudflare Workers edge runtime (V8 isolates, no Node.js APIs).

---

## Provider Comparison Matrix

| Feature | Better Auth | Clerk | Auth0 | Supabase Auth | Firebase Auth | WorkOS | Stytch | Hanko |
|---|---|---|---|---|---|---|---|---|
| **Free Tier Users** | Unlimited (OSS) | 10K MAU | 25K MAU | 50K MAU | 50K MAU | 1M MAU | 10K MAU | 10K MAU |
| **CF Workers Compat** | Native (first-class) | Yes (backend SDK) | Partial (SPA-side only) | Partial (issues with @supabase/ssr) | No (needs 3rd-party lib) | Unknown | Unknown (old Axios issue) | No (Go backend) |
| **D1 Support** | Yes (Drizzle adapter) | N/A (managed) | N/A (managed) | N/A (managed) | N/A (managed) | N/A (managed) | N/A (managed) | N/A (managed) |
| **Hono Integration** | Official example | Manual SDK | Manual JWT | Manual SDK | Manual JWT | Manual SDK | Manual SDK | Separate API |
| **Email/Password** | Yes | Yes | Yes | Yes | Yes | Yes | No (passwordless-first) | Yes |
| **Google OAuth** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **GitHub OAuth** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Facebook OAuth** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Twitch OAuth** | Yes (built-in) | Yes | Yes | Yes | Yes | Unknown | Unknown | Unknown |
| **2FA / TOTP** | Yes (plugin) | Yes | Yes | Yes | Yes (Identity Platform) | N/A (relies on IdP) | Yes | Yes |
| **Passkeys/WebAuthn** | Yes (plugin) | Yes | Yes (all plans) | No (not native) | No | No | Yes | Yes (core focus) |
| **RBAC / Roles** | Yes (admin plugin) | Yes (Organizations) | Yes | Manual (via metadata) | Manual (custom claims) | Enterprise focus | Yes | Manual |
| **Admin Panel** | No (build your own) | Yes (built-in dashboard) | Yes (built-in dashboard) | Yes (Supabase Studio) | Yes (Firebase Console) | Yes (dashboard) | Yes (dashboard) | Yes (if self-hosted) |
| **Self-Hosted** | Yes (it IS the code) | No | No | Yes (GoTrue) | No | No | No | Yes |
| **Vendor Lock-in** | None | High | High | Medium | High | High | High | Low |
| **Cost at 50 users** | $0 | $0 | $0 | $0 | $0 | $0 | $0 | $0 |

---

## Detailed Provider Analysis

### 1. Better Auth (RECOMMENDED)

**What it is:** An open-source TypeScript authentication library (not a SaaS). You own the code, it runs in your Worker, data lives in your D1 database. Emerged in 2025 as the recommended successor to the deprecated Lucia Auth.

**Cloudflare Workers Compatibility: EXCELLENT**
- First-class Cloudflare Workers + D1 support
- Official Hono integration example on hono.dev
- Dedicated `better-auth-cloudflare` npm package with CLI for project scaffolding, D1 provisioning, and migrations
- Uses Drizzle ORM adapter for D1 (SQLite)
- No Node.js API dependencies -- built for edge runtimes

**Features Checklist:**
- Email/password registration: Yes (core)
- OAuth SSO: 40+ built-in providers including Google, GitHub, Facebook, **Twitch** (all four you need)
- Generic OAuth plugin for any additional provider
- 2FA/TOTP: Yes (plugin, 30-second interval default, QR code URI generation)
- Passkeys/WebAuthn: Yes (plugin, powered by SimpleWebAuthn, stores passkey data in DB)
- RBAC: Yes (admin plugin with `createAccessControl()`, custom roles/permissions, user banning, impersonation)
- Organization plugin for multi-tenant scenarios
- Can also act as an OAuth 2.1 Provider itself

**Admin Panel:** No built-in UI dashboard. You would need to build admin pages in your React SPA using the admin plugin API endpoints (create users, ban/unban, manage roles, impersonate).

**Pricing:** Free. Open source. MIT license. No MAU limits, no feature gates, no usage charges. Your only costs are Cloudflare Workers/D1 infrastructure (which has a generous free tier).

**Lock-in:** Zero. Data lives in your D1 database. Code runs in your Worker. You can fork, modify, or replace at any time.

**Risks:**
- Newer project (emerged 2025) -- smaller community than Auth0/Clerk, though growing rapidly (8,200+ Discord members)
- No SOC 2 or security certifications (you own the security posture)
- You must build your own admin UI
- You must handle password hashing edge cases (Argon2 not available in Workers -- likely uses bcrypt or scrypt via WebCrypto)

**Sources:**
- [Better Auth on Cloudflare - Hono](https://hono.dev/examples/better-auth-on-cloudflare)
- [Better Auth - Hono Integration](https://www.better-auth.com/docs/integrations/hono)
- [better-auth-cloudflare npm](https://github.com/zpg6/better-auth-cloudflare)
- [Better Auth Passkey Plugin](https://www.better-auth.com/docs/plugins/passkey)
- [Better Auth 2FA Plugin](https://www.better-auth.com/docs/plugins/2fa)
- [Better Auth Admin Plugin](https://www.better-auth.com/docs/plugins/admin)
- [Better Auth Twitch Provider](https://www.better-auth.com/docs/authentication/twitch)
- [Better Auth OAuth Providers](https://www.better-auth.com/docs/concepts/oauth)

---

### 2. Clerk

**What it is:** A managed authentication SaaS with pre-built UI components, a developer dashboard, and backend SDKs. Developer-friendly, React-focused.

**Cloudflare Workers Compatibility: GOOD**
- `@clerk/backend` is built for V8 isolates (Cloudflare Workers, Vercel Edge Runtime)
- Works across all JavaScript runtimes
- Community examples exist for Remix + Clerk on Cloudflare Workers
- No official Hono middleware, but JWT validation in Workers is straightforward

**Features Checklist:**
- Email/password: Yes
- OAuth SSO: Google, GitHub, Facebook, and many more. Twitch support needs verification (likely via custom OAuth).
- 2FA/TOTP: Yes
- Passkeys/WebAuthn: Yes (max 10 per account, domain-bound)
- RBAC: Yes (Organizations feature with custom roles and permissions)
- Admin Panel: Yes -- built-in Clerk Dashboard with user management, impersonation, allowlist/blocklist/waitlist

**Pricing:**
- Free: Up to 10,000 MAU (some sources say 50,000 "retained users" but 10K MAU for active production use)
- Pro: $25/month + $0.02 per MAU beyond 10,000
- Beyond 100 organizations: $1/month each
- At 50 users: **$0/month**

**Lock-in:** HIGH. Users, sessions, and auth logic live in Clerk's infrastructure. Migration requires exporting user data and rebuilding auth flows. Clerk owns the session management.

**Risks:**
- SPA + Workers architecture means the React app handles login via Clerk's hosted components, and your Worker validates JWTs. This works but adds a dependency on Clerk's availability.
- No self-hosted option
- Pricing scales linearly -- at 1,000 MAU still free, but enterprise features (SAML SSO) require higher tiers

**Sources:**
- [Clerk Pricing](https://clerk.com/pricing)
- [Clerk Backend SDK Docs](https://clerk.com/docs/guides/development/sdk-development/backend-only)
- [Clerk Roles & Permissions](https://clerk.com/docs/guides/organizations/control-access/roles-and-permissions)
- [Clerk Dashboard Overview](https://clerk.com/docs/guides/dashboard/overview)
- [Remix + Clerk on Cloudflare Workers](https://otterai.net/blog/remix-clerk-cloudflare-workers-2025)
- [Clerk Pricing Guide 2025](https://www.getmonetizely.com/articles/clerk-pricing-in-2025-how-the-free-tier-really-compares-to-paid-plans)

---

### 3. Auth0 (Okta)

**What it is:** Enterprise-grade managed identity platform, now owned by Okta. The most mature and feature-complete option.

**Cloudflare Workers Compatibility: PARTIAL**
- Cloudflare has an official tutorial: "Authorize users with Auth0" for Workers
- Auth0 SPA SDK (`auth0-spa-js`) is edge-compatible -- handle login in the React SPA
- Server-side Auth0 SDKs (`nextjs-auth0`, `express-openid-connect`) do NOT work in Workers (rely on Node.js APIs)
- JWT validation in Workers works fine (just verify the token)
- Pattern: React SPA does login via Auth0 Universal Login, Worker validates JWT on API calls

**Features Checklist:**
- Email/password: Yes
- OAuth SSO: Google, GitHub, Facebook, Twitch, and many more
- 2FA/TOTP: Yes
- Passkeys/WebAuthn: Yes (GA on all plans including free tier, since Q1 2024)
- RBAC: Yes (built-in roles and permissions system)
- Admin Panel: Yes -- Auth0 Dashboard with full user management

**Pricing:**
- Free: 25,000 MAU (increased from 7,500 in Sep 2024), unlimited social connections
- B2C Essentials: $35/month for 500 MAU
- B2B Essentials: $150/month for 500 MAU
- At 50 users: **$0/month**

**Lock-in:** HIGH. Auth0's user store, rules engine, and extensions create deep coupling. Migration is complex -- you need to export password hashes (if allowed) and rebuild all auth flows. Okta acquisition has raised concerns about future pricing changes.

**Risks:**
- "Growth penalty" -- pricing escalates significantly as you scale (documented complaints from startups)
- Free tier is generous now but Okta has a history of changing pricing
- Server-side SDK incompatibility with Workers means you're limited to SPA-mode auth flow
- Overkill for a 50-user personal project

**Sources:**
- [Auth0 Pricing](https://auth0.com/pricing)
- [Authorize users with Auth0 - Cloudflare Workers Docs](https://developers.cloudflare.com/workers/tutorials/authorize-users-with-auth0)
- [Auth0 Passkeys Announcement](https://auth0.com/blog/all-you-need-to-know-about-passkeys-at-auth0/)
- [Auth0 Pricing Explained (Growth Penalty)](https://securityboulevard.com/2025/09/auth0-pricing-explained-and-why-startups-call-it-a-growth-penalty/)
- [Auth0 V8 Runtime Guide](https://winder.ai/a-guide-to-auth0-apps-on-cloudflare-v8-runtime-adoption/)

---

### 4. Supabase Auth (GoTrue)

**What it is:** Open-source auth built on GoTrue, bundled with Supabase's PostgreSQL platform. Can be self-hosted.

**Cloudflare Workers Compatibility: PARTIAL**
- `@supabase/supabase-js` works in Workers for basic operations
- `@supabase/ssr` does NOT work in Workers (dynamic require of "stream" error)
- Integration requires using the Supabase client carefully to avoid Node.js dependencies
- Supabase Auth requires a Supabase PostgreSQL instance (cannot use D1 directly for auth)

**Features Checklist:**
- Email/password: Yes
- OAuth SSO: Google, GitHub, Facebook, **Twitch** -- all supported natively
- 2FA/TOTP: Yes (App Authenticator with TOTP, SMS, email)
- Passkeys/WebAuthn: **NO** -- not natively supported. Open feature request since 2022, still not implemented. Requires third-party workarounds.
- RBAC: Manual -- you manage roles via user metadata or custom tables. No built-in role system.
- Admin Panel: Yes -- Supabase Studio dashboard for user management

**Pricing:**
- Free: 50,000 MAU, 500MB database, 2 active projects (paused after 1 week inactivity)
- Pro: $25/month for 100,000 MAU
- At 50 users: **$0/month** (but you need a Supabase project, which pauses on inactivity)

**Architecture Concern:** Using Supabase Auth with a Cloudflare Workers app means your auth lives in Supabase's PostgreSQL while your app data lives in D1. This split-database architecture adds complexity and latency (your Worker calls out to Supabase's API for every auth check).

**Lock-in:** MEDIUM. GoTrue is open source and can be self-hosted, but the managed Supabase experience has proprietary elements. You can theoretically run your own GoTrue instance.

**Risks:**
- No passkey support is a dealbreaker given your requirements
- Free tier projects pause after 1 week of inactivity (annoying for a personal project)
- Split database architecture (D1 for app data, Supabase Postgres for auth)
- SSR compatibility issues with Workers

**Sources:**
- [Supabase + Cloudflare Workers Docs](https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/)
- [Supabase Auth MFA/TOTP Docs](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [Supabase Passkey Discussion (#8677)](https://github.com/orgs/supabase/discussions/8677)
- [Supabase Pricing](https://supabase.com/pricing)
- [@supabase/ssr Workers Issue](https://github.com/supabase/supabase/issues/37592)
- [Login with Twitch - Supabase Docs](https://supabase.com/docs/guides/auth/social-login/auth-twitch)

---

### 5. Firebase Auth

**What it is:** Google's authentication service, part of the Firebase platform. Generous free tier, wide OAuth support.

**Cloudflare Workers Compatibility: POOR**
- `firebase-admin` SDK relies on Node.js APIs -- does NOT work in Workers
- Third-party library `firebase-auth-cloudflare-workers` (zero dependencies, Web Standard API) provides token verification only
- Pattern: React SPA handles login via Firebase client SDK, Worker verifies ID tokens using the third-party library + KV for public key caching
- No official Cloudflare support from Google

**Features Checklist:**
- Email/password: Yes
- OAuth SSO: Google, Facebook, GitHub, Apple, Twitter, and more. Twitch not built-in (would need custom OAuth).
- 2FA/TOTP: Yes, but requires upgrade to Identity Platform tier
- Passkeys/WebAuthn: **NO** native support
- RBAC: Manual -- custom claims on tokens, no built-in role system
- Admin Panel: Yes -- Firebase Console with user management

**Pricing:**
- Free: 50,000 MAU for email/password and social login
- Phone auth: NOT free (SMS billed per message, $0.01-$0.06)
- SAML/OIDC: 50 MAU free, then $0.015/MAU
- Identity Platform (for TOTP MFA): Tiered pricing above 50K MAU
- At 50 users: **$0/month** (for basic auth without TOTP)

**Lock-in:** HIGH. Firebase Auth is tightly coupled to Google's infrastructure. No self-hosted option. Migrating away requires exporting users and rebuilding everything.

**Risks:**
- No Twitch provider built-in
- TOTP requires Identity Platform upgrade
- No passkey support
- Workers compatibility relies on third-party library
- Google has a history of sunsetting products

**Sources:**
- [firebase-auth-cloudflare-workers (npm)](https://www.npmjs.com/package/firebase-auth-cloudflare-workers)
- [Firebase Auth Pricing](https://firebase.google.com/pricing)
- [Firebase TOTP MFA Docs](https://firebase.google.com/docs/auth/web/totp-mfa)
- [Firebase Auth Pricing Guide 2026](https://www.metacto.com/blogs/the-complete-guide-to-firebase-auth-costs-setup-integration-and-maintenance)

---

### 6. WorkOS

**What it is:** Enterprise-focused authentication platform (AuthKit). Designed for B2B SaaS with SSO/SCIM. Free tier is surprisingly generous.

**Cloudflare Workers Compatibility: UNKNOWN**
- WorkOS supports SAML connections with Cloudflare
- AuthKit can be used for authenticating in Workers MCP servers
- No documented Hono or Workers-specific SDK
- Likely works via JWT validation pattern (SPA login + Worker JWT verify)

**Features Checklist:**
- Email/password: Yes (via AuthKit)
- OAuth SSO: Google, GitHub, Microsoft, Apple. Facebook and Twitch support unclear.
- 2FA/TOTP: Relies on IdP (enterprise SSO handles MFA)
- Passkeys/WebAuthn: No documented support
- RBAC: Enterprise-focused (role management via SAML groups/SCIM)
- Admin Panel: Yes -- WorkOS Dashboard

**Pricing:**
- Free: 1,000,000 MAU for AuthKit (the most generous free tier by far)
- Enterprise SSO: $125/connection/month (each customer's IdP is a "connection")
- At 50 users: **$0/month**

**Why it doesn't fit:** WorkOS is enterprise B2B-focused. It's designed for apps that sell to companies with their own IdPs (Okta, Azure AD, etc.). For a personal project with consumer-style auth (email/password, social login, passkeys), WorkOS is the wrong tool. The 1M MAU free tier is impressive but the feature set doesn't align.

**Sources:**
- [WorkOS Pricing](https://workos.com/pricing)
- [WorkOS + Cloudflare Integration](https://workos.com/docs/integrations/cloudflare-saml)
- [WorkOS Alternatives](https://supertokens.com/blog/workos-alternatives)

---

### 7. Stytch

**What it is:** Passwordless-first authentication platform. Strong on magic links, OTP, and WebAuthn.

**Cloudflare Workers Compatibility: POOR/UNKNOWN**
- Historical issue: Stytch Node SDK used Axios (XHR-based), incompatible with Workers' fetch-only environment
- GitHub issue from 2021 requested switch to fetch -- unclear if resolved
- No documented Workers integration or edge runtime support
- After Twilio acquisition, direction is increasingly enterprise-focused

**Features Checklist:**
- Email/password: **NO** (passwordless-first -- magic links, OTP)
- OAuth SSO: Google, GitHub, Facebook. Twitch unclear.
- 2FA/TOTP: Yes (part of their MFA offering)
- Passkeys/WebAuthn: Yes (core feature)
- RBAC: Yes (B2B tier)
- Admin Panel: Yes (dashboard)

**Pricing:**
- Free: 10,000 MAU (B2C), includes unlimited organizations for B2B
- Complex per-use model: base fee + MAU charges + per-feature charges
- Budgeting is less predictable than competitors
- At 50 users: **$0/month**

**Why it doesn't fit:** No email/password (passwordless-only), uncertain Workers compatibility, Twilio acquisition raising concerns about direction and pricing. Complex pricing model for a personal project.

**Sources:**
- [Stytch Pricing](https://stytch.com/pricing)
- [Stytch Self-Serve Pricing Blog](https://stytch.com/blog/stytch-self-serve-pricing/)
- [Stytch CF Workers GitHub Issue #91](https://github.com/stytchauth/stytch-node/issues/91)
- [WorkOS vs Auth0 vs Stytch](https://workos.com/blog/workos-vs-auth0-vs-stytch)

---

### 8. Hanko

**What it is:** Open-source, passkey-first authentication platform. Backend is a Go API, frontend uses Web Components. Can be self-hosted or used via Hanko Cloud.

**Cloudflare Workers Compatibility: NOT COMPATIBLE (as embedded auth)**
- Hanko's backend is a **Go application** (HTTP API for passkeys, passwords, passcodes, OAuth, JWT issuing)
- It runs as a separate service, not inside your Worker
- Your Worker would call Hanko's API for auth operations and validate JWTs
- Architecture: React SPA uses Hanko Elements (Web Components) for login UI -> Hanko API -> Your Worker validates JWT
- This is a sidecar pattern, not embedded auth

**Features Checklist:**
- Email/password: Yes
- OAuth SSO: Yes (social logins, SAML SSO)
- 2FA/TOTP: Yes
- Passkeys/WebAuthn: Yes (core differentiator)
- RBAC: Manual (not built-in, implement via your own logic)
- Admin Panel: Yes (when self-hosted, you get admin access)

**Pricing:**
- Self-hosted: Free (open source)
- Hanko Cloud: 10,000 MAU free, then $0.01/MAU (reduced from $0.02)
- At 50 users: **$0/month**

**Architecture Consideration:** Running Hanko self-hosted means deploying another service (Go binary + PostgreSQL). This adds infrastructure complexity to your homelab. Hanko Cloud is simpler but adds an external dependency. Either way, auth is not embedded in your Worker -- it's a separate service your app calls out to.

**Lock-in:** LOW. Open source, can self-host, data is yours.

**Sources:**
- [Hanko GitHub](https://github.com/teamhanko/hanko)
- [Hanko Pricing](https://www.hanko.io/pricing)
- [Hanko New Pricing Blog](https://www.hanko.io/blog/our-new-pricing)
- [Hanko Documentation](https://docs.hanko.io/introduction)
- [Integrate Hanko with Go Backend](https://docs.hanko.io/quickstarts/backend/go)

---

### 9. Lucia Auth (DEPRECATED)

**Status: DEPRECATED as of March 2025.** The npm package is maintained for bug fixes only. The maintainer pivoted Lucia to an educational resource because the database adapter model was too inflexible.

**Recommendation:** The Lucia community and maintainer both recommend **Better Auth** as the successor for new projects. Direct quote from community analysis: "Better Auth emerged in 2025 as the recommended solution for new authentication implementations."

**Do not use Lucia for new projects.**

**Sources:**
- [Lucia Auth Deprecation Discussion](https://github.com/lucia-auth/lucia/discussions/1714)
- [Lucia Auth is Dead - What's Next](https://www.wisp.blog/blog/lucia-auth-is-dead-whats-next-for-auth)
- [Migrate from Lucia v3](https://lucia-auth.com/lucia-v3/migrate)

---

### 10. Oslo / Arctic

**What they are:** Lightweight, runtime-agnostic OAuth libraries by the same author as Lucia Auth. NOT full auth solutions -- they handle OAuth flows only.

**Arctic v3:**
- TypeScript OAuth 2.0 / OIDC client library
- Built on Fetch API -- works on Node.js, Bun, Deno, **Cloudflare Workers**
- No Web Crypto polyfill needed in Workers
- Provides OAuth clients for major providers
- You would use Arctic to implement the OAuth flow yourself, handling sessions, users, and storage manually

**Oslo:**
- Lower-level cryptographic utilities (hashing, tokens, encoding)
- Runtime-agnostic, works in Workers

**Also relevant: `@cloudflare/workers-oauth-provider`**
- Official Cloudflare library for the **provider side** of OAuth 2.1 (PKCE)
- Makes your Worker act as an OAuth provider
- Different use case from Arctic (which is for consuming OAuth providers)

**When to use:** If you choose Better Auth, you don't need Arctic -- Better Auth handles OAuth internally. Arctic is for if you want to build completely custom auth from scratch.

**Sources:**
- [Arctic v3 Documentation](https://arcticjs.dev/)
- [Cloudflare Workers OAuth Provider](https://github.com/cloudflare/workers-oauth-provider)

---

### 11. Cloudflare Access (Zero Trust)

**What it is:** Cloudflare's Zero Trust Network Access (ZTNA) product. Gate-level access control that sits in front of your application. Already in use on your domain.

**How it works:**
- Users authenticate via configured IdPs (Google, GitHub, one-time PIN, etc.) before reaching your app
- Cloudflare issues a JWT (`Cf-Access-Jwt-Assertion` header) with user identity claims
- Your Worker validates this JWT to confirm the user passed through Access
- Access policies control WHO can reach the app (by email, IdP group, IP, device posture)

**Free Tier:** Up to 50 users, 50 applications, basic Access features. Beyond 50 users: $7/user/month (Standard plan, all users must upgrade together).

**Can it replace app-level auth?**

**What Access CAN do:**
- Authenticate users before they reach your app (gate access)
- Pass user identity (email, IdP groups, custom SAML/OIDC claims) via JWT to your Worker
- Eliminate the need for a login page (Access provides one)
- Support Google and GitHub as IdPs (and any SAML/OIDC provider)
- Provide one-time PIN login (email-based)

**What Access CANNOT do:**
- User registration (it authenticates existing identities, doesn't create accounts)
- Email/password auth (no local credential storage)
- App-level roles (user, admin, super_admin) -- it only knows about IdP groups
- 2FA/TOTP (relies on the IdP to handle MFA)
- Passkeys/WebAuthn (not supported, community has requested it)
- User management admin panel (it manages access policies, not user profiles)
- Facebook or Twitch as IdPs (supports Google, GitHub, Azure AD, Okta, SAML, OIDC, one-time PIN)

**Hybrid approach possibility:** You could use Cloudflare Access as the authentication layer (who gets in) and build app-level authorization on top (roles, permissions, user profiles). Your Worker would:
1. Read the `Cf-Access-Jwt-Assertion` header to get the authenticated user's email
2. Look up that email in your D1 database to get their role (user/admin/super_admin)
3. Manage a `users` table in D1 with roles, preferences, etc.

**Limitations of the hybrid approach:**
- No self-registration (admin must add users to Access policy, or you use a broad policy and handle registration in-app)
- Limited to IdPs that Access supports (no Facebook, no Twitch)
- No passkey support
- 50-user limit on free tier matches your scale but no room to grow
- Users need Cloudflare Access accounts/sessions, which is a different UX from a standard login page

**Verdict:** Cloudflare Access is great for protecting internal tools with a small team, but it's NOT a replacement for app-level authentication. It lacks registration, local credentials, passkeys, and consumer-oriented IdP support. You would still need another auth solution for the features on your requirements list.

**Sources:**
- [Cloudflare Zero Trust Pricing](https://www.cloudflare.com/plans/zero-trust-services/)
- [Validate JWTs - Cloudflare One Docs](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/)
- [Cloudflare Access Overview](https://www.cloudflare.com/zero-trust/products/access/)
- [Cloudflare Passkey Request (Community)](https://community.cloudflare.com/t/why-is-there-still-no-useful-passkey-support-in-2025/866461)

---

## Trade-offs: Managed Auth vs Custom-Built for a Small Personal Project

### Managed Auth (Clerk, Auth0, Firebase, Stytch, WorkOS)

**Pros:**
- Zero auth code to write or maintain
- Built-in admin dashboards
- Handles security updates, vulnerability patches
- Pre-built login UI components
- Compliance certifications (SOC 2, etc.)

**Cons:**
- Vendor lock-in -- migrating away is painful (especially password hashes)
- External dependency for every login attempt (latency + availability risk)
- Pricing can change at vendor's discretion (Okta/Auth0 history)
- Feature gating -- advanced features often locked behind paid tiers
- Not all SDKs work on Cloudflare Workers edge runtime
- Overkill for 50 users -- you're using 0.2% of a system designed for millions

### Open-Source Library (Better Auth, Lucia successor)

**Pros:**
- No external dependency -- auth runs inside your Worker
- Data lives in your D1 database (no split architecture)
- No vendor lock-in, no pricing changes
- Full control over every aspect of the auth flow
- Can customize for exact needs (Star Citizen fleet app doesn't need enterprise SAML)
- No MAU limits, no feature gates

**Cons:**
- You own the security posture (no SOC 2 certification behind you)
- Need to build admin UI yourself
- Smaller community than mature SaaS providers
- Must keep library updated for security patches
- Password hashing on edge runtime has constraints (no Argon2)

### Recommendation for this project:

For a personal project with 1-50 users, a Cloudflare Workers + D1 stack, and specific feature requirements (passkeys, Twitch OAuth, RBAC), **Better Auth is the clear winner**:

1. It's the only option with native Cloudflare Workers + D1 + Hono support
2. It has every feature you need as plugins (passkeys, TOTP, admin/RBAC, all 4 OAuth providers)
3. Zero cost, zero vendor lock-in
4. Data stays in your D1 database alongside your fleet data
5. Active community and recommended by the Lucia Auth author's community
6. Official Hono example on hono.dev

The main trade-off is building your own admin panel UI -- but you're already building a React SPA, so adding admin pages is incremental work.

---

## Elimination Summary

| Provider | Verdict | Reason |
|---|---|---|
| **Better Auth** | **USE THIS** | Native CF Workers + D1 + Hono. All features. Free. No lock-in. |
| Clerk | Strong runner-up | Excellent DX, built-in admin panel, but vendor lock-in and managed dependency |
| Auth0 | Viable but overkill | Generous free tier, all features, but high lock-in and SPA-only Workers pattern |
| Supabase Auth | Eliminated | No passkey support, split database architecture, SSR issues with Workers |
| Firebase Auth | Eliminated | No passkeys, no Twitch, poor Workers compat, Node.js dependency |
| WorkOS | Eliminated | Enterprise B2B focus, wrong tool for consumer auth |
| Stytch | Eliminated | No email/password, uncertain Workers compat, complex pricing |
| Hanko | Possible but awkward | Good features, but separate Go service (not embedded in Worker) |
| Lucia Auth | Eliminated | Deprecated March 2025. Community recommends Better Auth. |
| Oslo/Arctic | Not standalone | OAuth libraries only, not full auth solutions. Better Auth uses these internally. |
| Cloudflare Access | Supplement only | Cannot handle registration, passkeys, Twitch, RBAC, or app-level user management |

---

## Implementation Architecture (Better Auth + Cloudflare Workers)

```
React SPA (frontend)
  |
  |-- Better Auth client SDK (handles login UI, OAuth redirects, passkey flows)
  |-- Calls /api/auth/* endpoints on Worker
  |
Cloudflare Worker (Hono)
  |
  |-- Better Auth server (mounted on /api/auth/*)
  |   |-- Email/password registration + login
  |   |-- OAuth flows (Google, GitHub, Facebook, Twitch)
  |   |-- TOTP 2FA enrollment + verification
  |   |-- Passkey registration + authentication
  |   |-- Session management (JWT or session tokens)
  |   |-- Admin plugin (role management, user CRUD, ban/unban)
  |
  |-- Your app API routes (/api/ships, /api/fleet, etc.)
  |   |-- Middleware: verify session, check roles
  |
Cloudflare D1 (SQLite)
  |
  |-- Better Auth tables (users, sessions, accounts, passkeys, 2fa, etc.)
  |-- Your app tables (vehicles, user_fleet, manufacturers, etc.)
  |
Cloudflare Access (Zero Trust)
  |
  |-- Optional: keep as outer security layer (access policies)
  |-- Better Auth handles all app-level auth independently
```

### Key Implementation Notes:

1. **Hono integration:** Mount Better Auth handler on `/api/auth/*` routes
2. **D1 via Drizzle:** Use `better-auth-cloudflare` CLI for schema setup and migrations
3. **OAuth:** Configure client IDs/secrets for Google, GitHub, Facebook, Twitch in Worker environment variables (Cloudflare secrets)
4. **Passkeys:** Configure `rpID` (your domain), `rpName`, and `origin` in the passkey plugin
5. **RBAC:** Define roles (user, admin, super_admin) and permissions via the admin plugin's `createAccessControl()`
6. **Admin UI:** Build React pages that call admin API endpoints for user management
7. **Cloudflare Access:** Can remain as an additional security layer but is not required for auth

---
---

# Better Auth Deep Analysis: Cloudflare Workers + Hono + D1

> Research document for adding multi-user authentication to the SC Companion fleet manager app.
> Generated: 2026-02-23 | better-auth v1.4.18 (stable) / v1.5.0-beta.13 (beta)

---

## Table of Contents

1. [Core Architecture](#1-core-architecture)
2. [Cloudflare Workers + D1 Integration](#2-cloudflare-workers--d1-integration)
3. [Plugin Deep Dives](#3-plugin-deep-dives)
4. [Frontend Client](#4-frontend-client)
5. [Email Integration](#5-email-integration)
6. [Migration from Existing Schema](#6-migration-from-existing-schema)
7. [Real-World Examples](#7-real-world-examples)
8. [Version, Stability & Ecosystem Health](#8-version-stability--ecosystem-health)
9. [Critical Risks & Mitigations](#9-critical-risks--mitigations)
10. [Recommended Implementation Plan](#10-recommended-implementation-plan)

---

## 1. Core Architecture

### Request Lifecycle

Better Auth acts as a standalone HTTP handler mounted at a base path (default `/api/auth`). When a request hits the auth path:

1. Hono catches `GET`/`POST` on `/api/auth/*` and delegates to `auth.handler(c.req.raw)`
2. Better Auth's internal router matches the path to an endpoint (e.g., `/api/auth/sign-in/email`)
3. The endpoint handler validates input, interacts with the database adapter, and returns a `Response`
4. Cookies are set on the response for session management

```ts
// Mount in Hono - this is the entire integration point
app.on(["POST", "GET"], "/api/auth/*", (c) => {
    return auth.handler(c.req.raw);
});
```

### Session Management

Better Auth uses **cookie-based database sessions** -- NOT JWTs, NOT opaque tokens in headers. This is important to understand:

- A session record is created in the `session` table with a random `token`
- That token is set as an HTTP cookie (`better-auth.session_token`)
- On each request, the cookie is read, the session is looked up in the database
- Sessions expire after **7 days** by default, with a **1-day refresh window**

```ts
export const auth = betterAuth({
    session: {
        expiresIn: 60 * 60 * 24 * 7,    // 7 days (seconds)
        updateAge: 60 * 60 * 24,         // Refresh session every 1 day
        freshAge: 60 * 5,                // Consider "fresh" for 5 minutes
    }
});
```

**Cookie caching** can reduce database lookups by encoding session data into a signed cookie:

```ts
session: {
    cookieCache: {
        enabled: true,
        maxAge: 5 * 60,         // 5 minutes
        strategy: "compact"     // "compact" | "jwt" | "jwe"
    }
}
```

| Strategy | Size | Security | Readable |
|----------|------|----------|----------|
| `compact` | Smallest | Signed | Yes |
| `jwt` | Medium | Signed | Yes |
| `jwe` | Largest | Encrypted | No |

**Caveat**: With cookie caching, revoked sessions remain active on other devices until the cache TTL expires.

### Database Schema (4 Core Tables)

Better Auth creates these tables automatically:

#### `user` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | string | Primary key (UUID by default) |
| `name` | string | Display name |
| `email` | string | Login identifier |
| `emailVerified` | boolean | Verification status |
| `image` | string? | Profile picture URL |
| `createdAt` | Date | Auto-set |
| `updatedAt` | Date | Auto-set |

#### `session` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | string | Primary key |
| `userId` | string | FK to user |
| `token` | string | Unique session token (= cookie value) |
| `expiresAt` | Date | When session expires |
| `ipAddress` | string? | Client IP |
| `userAgent` | string? | Browser info |
| `createdAt` | Date | Auto-set |
| `updatedAt` | Date | Auto-set |

#### `account` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | string | Primary key |
| `userId` | string | FK to user |
| `accountId` | string | Provider's user ID |
| `providerId` | string | "credential", "google", "github", etc. |
| `accessToken` | string? | OAuth access token |
| `refreshToken` | string? | OAuth refresh token |
| `accessTokenExpiresAt` | Date? | Token expiry |
| `refreshTokenExpiresAt` | Date? | Refresh expiry |
| `scope` | string? | OAuth scopes granted |
| `idToken` | string? | OIDC ID token |
| `password` | string? | Hashed password (credential accounts only) |
| `createdAt` | Date | Auto-set |
| `updatedAt` | Date | Auto-set |

#### `verification` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | string | Primary key |
| `identifier` | string | Email or phone target |
| `value` | string | Verification code/token |
| `expiresAt` | Date | Token expiry |
| `createdAt` | Date | Auto-set |
| `updatedAt` | Date | Auto-set |

**Key design note**: Passwords are stored in the `account` table (not `user`), with `providerId = "credential"`. This means a single user can have both a password account AND OAuth accounts linked together.

### Password Hashing

**Default algorithm**: `scrypt` (via Node.js `crypto.scrypt`)

Better Auth chose scrypt because:
- Natively supported by Node.js (no native bindings needed)
- OWASP recommended when Argon2id is unavailable
- Memory-hard (resistant to GPU/ASIC attacks)

**Critical for Cloudflare Workers**: scrypt takes ~80ms CPU time per hash. This is fine on paid Workers plans (30s CPU limit) but will immediately hit the 10ms CPU limit on the free tier.

**Custom hash functions** are supported via configuration:

```ts
emailAndPassword: {
    enabled: true,
    password: {
        hash: async (password: string): Promise<string> => {
            // Your custom implementation
            return hashedPassword;
        },
        verify: async ({ hash, password }): Promise<boolean> => {
            // Your custom verification
            return isValid;
        }
    }
}
```

**PBKDF2 alternative for Cloudflare Workers** (uses Web Crypto API natively):

```ts
import PBKDF2Lite from 'pbkdf2-lite';

const hasher = new PBKDF2Lite(60000); // 60k iterations

emailAndPassword: {
    enabled: true,
    password: {
        hash: async (password) => hasher.hash(password),
        verify: async ({ hash, password }) => hasher.verify(hash, password),
    }
}
```

The `pbkdf2-lite` package is purpose-built for edge runtimes with configurable iterations (20k-100k depending on CPU budget).

**However**: With `nodejs_compat` enabled in `wrangler.toml`, Cloudflare Workers now supports the full `node:crypto` API including `scrypt`. So the default scrypt hasher should work if you are on a paid Workers plan. The `nodejs_compat` flag is required regardless (for AsyncLocalStorage).

---

## 2. Cloudflare Workers + D1 Integration

### Required wrangler.toml Configuration

```toml
compatibility_flags = ["nodejs_compat"]
compatibility_date = "2025-02-18"
```

The `nodejs_compat` flag is **mandatory** for Better Auth because it uses `AsyncLocalStorage` internally for async context tracking. As a bonus, this also polyfills `node:crypto` (including scrypt).

### Environment Variables Needed

Add to `.dev.vars` (local) and `wrangler secret put` (production):

```
BETTER_AUTH_SECRET=<32+ character random string>
BETTER_AUTH_URL=http://localhost:8787  # or production URL
```

### Two Approaches to D1 Integration

#### Approach A: Direct D1 Binding (Simplest)

Better Auth can accept a D1 binding directly. It uses Kysely internally with a SQLite dialect:

```ts
// src/lib/auth.ts
import { betterAuth } from "better-auth";
import type { Env } from "./types";

export function createAuth(env: Env) {
    return betterAuth({
        database: env.DB,  // D1 binding directly
        baseURL: env.BETTER_AUTH_URL,
        secret: env.BETTER_AUTH_SECRET,
        emailAndPassword: { enabled: true },
    });
}
```

**Pros**: No extra dependencies. Migrations handled by Better Auth's built-in Kysely adapter.
**Cons**: Can't use `@better-auth/cli migrate` at build time (needs runtime D1 access). Must use programmatic migrations.

#### Approach B: Drizzle Adapter (Recommended for Existing Projects)

```ts
// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/auth-schema";
import type { Env } from "./types";

export function createAuth(env: Env) {
    const db = drizzle(env.DB, { schema });
    return betterAuth({
        database: drizzleAdapter(db, {
            provider: "sqlite",  // D1 is SQLite under the hood
        }),
        baseURL: env.BETTER_AUTH_URL,
        secret: env.BETTER_AUTH_SECRET,
        emailAndPassword: { enabled: true },
    });
}
```

**Pros**: Schema generation via CLI (`@better-auth/cli generate --output src/db/auth-schema.ts`), Drizzle Kit handles migrations, can share Drizzle instance with app queries.
**Cons**: Extra dependency (drizzle-orm, drizzle-kit).

### Passing D1 to Better Auth in Hono Middleware

The key challenge on Cloudflare Workers is that D1 bindings are only available inside request handlers, not at module level. The solution is to create the auth instance per-request (or lazily cache it):

```ts
// src/index.ts
import { Hono } from "hono";
import { createAuth } from "./lib/auth";
import type { Env } from "./lib/types";

type HonoEnv = { Bindings: Env };
const app = new Hono<HonoEnv>();

// Auth handler - create auth instance with runtime env
app.on(["POST", "GET"], "/api/auth/*", async (c) => {
    const auth = createAuth(c.env);
    return auth.handler(c.req.raw);
});

// Session middleware for protected routes
app.use("/api/*", async (c, next) => {
    const auth = createAuth(c.env);
    const session = await auth.api.getSession({
        headers: c.req.raw.headers
    });
    c.set("user", session?.user ?? null);
    c.set("session", session?.session ?? null);
    return next();
});
```

### D1 Migrations

**Option 1: Programmatic migrations** (recommended for D1)

Create a migration endpoint that runs on first deploy or manually:

```ts
import { getMigrations } from "better-auth/db";

app.post("/api/migrate", async (c) => {
    // Protect this endpoint!
    const auth = createAuth(c.env);
    const { toBeCreated, toBeAdded, runMigrations } =
        await getMigrations(auth.options);

    if (toBeCreated.length === 0 && toBeAdded.length === 0) {
        return c.json({ message: "No migrations needed" });
    }

    await runMigrations();
    return c.json({
        tablesCreated: toBeCreated.map(t => t.table),
        columnsAdded: toBeAdded.map(t => t.table),
    });
});
```

**Option 2: Drizzle Kit migrations** (if using Drizzle adapter)

```bash
# Generate auth schema from better-auth config
npx @better-auth/cli generate --output src/db/auth-schema.ts

# Generate SQL migration files
npx drizzle-kit generate

# Apply to local D1
npx wrangler d1 migrations apply sc-companion --local

# Apply to production D1
npx wrangler d1 migrations apply sc-companion --remote
```

**Option 3: Manual SQL** (most control)

Write the D1 migration SQL yourself based on the schema above. Place in `src/db/migrations/` alongside existing migrations.

### The `better-auth-cloudflare` Package

The [`better-auth-cloudflare`](https://github.com/zpg6/better-auth-cloudflare) package wraps Better Auth with Cloudflare-specific helpers:

```ts
import { withCloudflare } from "better-auth-cloudflare";

const auth = betterAuth({
    ...withCloudflare({
        autoDetectIpAddress: true,
        geolocationTracking: true,
        cf: cf || {},
        d1: { db, options: { usePlural: true } },
        kv: env.KV,  // optional: session caching via KV
    }, {
        emailAndPassword: { enabled: true },
    })
});
```

Features:
- Auto IP detection from CF headers
- Geolocation enrichment (city, country, timezone)
- KV namespace for secondary session storage (minimum 60s TTL)
- R2 bucket integration for file uploads
- CLI for project scaffolding

**Assessment**: Useful for new projects but adds complexity. For SC Companion, the direct D1 binding approach is simpler and sufficient.

---

## 3. Plugin Deep Dives

### 3.1 OAuth / Social Providers

#### Configuration

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    socialProviders: {
        google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
        github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
        },
        discord: {
            clientId: env.DISCORD_CLIENT_ID,
            clientSecret: env.DISCORD_CLIENT_SECRET,
        },
        twitch: {
            clientId: env.TWITCH_CLIENT_ID,
            clientSecret: env.TWITCH_CLIENT_SECRET,
        },
    },
});
```

40+ providers are built in. Each provider accepts:
- `clientId` / `clientSecret` (required)
- `redirectURI` (optional, defaults to `/api/auth/callback/{provider}`)
- `scope` (optional, additional OAuth scopes)
- `mapProfileToUser` (optional, custom profile-to-user mapping)
- `disableSignUp` / `disableImplicitSignUp` (optional)

#### Callback URL Pattern

Default: `{BETTER_AUTH_URL}/api/auth/callback/{provider}`

Examples:
- `https://fleet.nerdz.cloud/api/auth/callback/google`
- `https://fleet.nerdz.cloud/api/auth/callback/github`
- `https://fleet.nerdz.cloud/api/auth/callback/twitch`

#### Where to Store Secrets

For Cloudflare Workers:

```bash
# Set via wrangler CLI (stored encrypted)
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put TWITCH_CLIENT_ID
wrangler secret put TWITCH_CLIENT_SECRET
wrangler secret put BETTER_AUTH_SECRET
```

For local dev, add to `.dev.vars`:

```
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
```

#### Account Linking

When a user signs in with a new OAuth provider using the same email:

```ts
account: {
    accountLinking: {
        enabled: true,
        trustedProviders: ["google", "github"],
        allowDifferentEmails: false,
    }
}
```

- By default, linking requires the provider to confirm the email is verified
- "Trusted providers" skip verification (use with caution)
- Manual linking via client: `authClient.linkSocial({ provider: "github" })`

#### Client Usage

```ts
// Sign in with OAuth
await authClient.signIn.social({
    provider: "google",
    callbackURL: "/dashboard",
});

// Link an additional provider to existing account
await authClient.linkSocial({
    provider: "discord",
});
```

### 3.2 Two-Factor Authentication (2FA / TOTP)

#### Server Configuration

```ts
import { twoFactor } from "better-auth/plugins";

export const auth = betterAuth({
    plugins: [
        twoFactor({
            issuer: "SC Companion",
            skipVerificationOnEnable: false,
            totpOptions: {
                digits: 6,
                period: 30,
            },
            backupCodeOptions: {
                amount: 10,
                length: 10,
            },
        })
    ]
});
```

#### Client Configuration

```ts
import { twoFactorClient } from "better-auth/client/plugins";

const authClient = createAuthClient({
    plugins: [
        twoFactorClient({
            onTwoFactorRedirect() {
                window.location.href = "/2fa";
            }
        })
    ]
});
```

#### Database Changes

Adds to `user` table:
- `twoFactorEnabled` (boolean)

Creates new `twoFactor` table:
- `id` (string PK)
- `userId` (string FK)
- `secret` (string) -- TOTP secret key (encrypted with XChaCha20-Poly1305)
- `backupCodes` (string) -- stored as JSON string

#### Enable 2FA Flow

```ts
// Step 1: Enable and get TOTP URI + backup codes
const { data } = await authClient.twoFactor.enable({
    password: "user-password",
});
// data.totpURI -> "otpauth://totp/SC%20Companion:user@email.com?secret=..."
// data.backupCodes -> ["code1", "code2", ...]

// Step 2: Show QR code (use qrcode.react)
// <QRCodeSVG value={data.totpURI} />

// Step 3: Verify the first TOTP code to confirm setup
const { data: verified } = await authClient.twoFactor.verifyTotp({
    code: "123456",
});
```

#### Login with 2FA

```ts
// Step 1: Normal sign-in
await authClient.signIn.email({
    email: "user@example.com",
    password: "password",
}, {
    onSuccess(context) {
        if (context.data.twoFactorRedirect) {
            window.location.href = "/2fa";
        }
    }
});

// Step 2: On the /2fa page, verify TOTP code
const { data } = await authClient.twoFactor.verifyTotp({
    code: "123456",
    trustDevice: true,  // Remember this device for 30 days
});
```

**Important**: 2FA can only be enabled for credential (password) accounts, not OAuth-only accounts.

### 3.3 Passkey / WebAuthn

#### Installation

```bash
npm install @better-auth/passkey
```

(Moved to a separate package in v1.4)

#### Server Configuration

```ts
import { passkey } from "@better-auth/passkey";

export const auth = betterAuth({
    plugins: [
        passkey({
            rpID: "fleet.nerdz.cloud",
            rpName: "SC Companion",
            origin: "https://fleet.nerdz.cloud",
        })
    ]
});
```

#### Client Configuration

```ts
import { passkeyClient } from "@better-auth/passkey/client";

const authClient = createAuthClient({
    plugins: [passkeyClient()]
});
```

#### Database Schema

Creates `passkey` table:

| Column | Type | Notes |
|--------|------|-------|
| `id` | string | Primary key |
| `name` | string? | User-assigned label |
| `publicKey` | string | WebAuthn public key |
| `userId` | string | FK to user |
| `credentialID` | string | WebAuthn credential ID |
| `counter` | number | Signature counter |
| `deviceType` | string | "platform" or "cross-platform" |
| `backedUp` | boolean | If credential is backed up |
| `transports` | string? | USB, BLE, NFC, internal |
| `aaguid` | string? | Authenticator attestation GUID |
| `createdAt` | Date? | Timestamp |

#### Registration Flow

```ts
// Add a passkey to existing authenticated user
const { data, error } = await authClient.passkey.addPasskey({
    name: "My YubiKey",
    authenticatorAttachment: "cross-platform",
});
// Browser triggers WebAuthn ceremony (fingerprint/PIN/security key)
```

#### Authentication Flow

```ts
// Sign in with passkey
const { data, error } = await authClient.signIn.passkey({
    autoFill: true,  // Enable browser autofill UI
});
```

#### Conditional UI (Browser Autofill)

```html
<input type="text" name="email" autocomplete="username webauthn" />
<input type="password" name="password" autocomplete="current-password webauthn" />
```

#### Cloudflare Workers Considerations

WebAuthn is purely a browser + server protocol -- no native crypto dependencies beyond what Web Crypto API provides. Should work fine on Workers. The server side only needs to verify signatures (using SubtleCrypto), not do expensive key generation.

### 3.4 Admin Plugin

#### Server Configuration

```ts
import { admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

// Define custom permission statements
const statement = {
    ...defaultStatements,
    fleet: ["view", "import", "delete"],
    analysis: ["view", "generate"],
} as const;

const ac = createAccessControl(statement);

// Define roles
export const superAdmin = ac.newRole({
    fleet: ["view", "import", "delete"],
    analysis: ["view", "generate"],
    user: ["create", "list", "set-role", "ban", "delete", "set-password"],
    session: ["list", "revoke"],
    ...adminAc.statements,
});

export const adminRole = ac.newRole({
    fleet: ["view", "import", "delete"],
    analysis: ["view", "generate"],
    user: ["create", "list", "ban"],
    session: ["list", "revoke"],
});

export const userRole = ac.newRole({
    fleet: ["view", "import"],
    analysis: ["view", "generate"],
});

// Register with auth
export const auth = betterAuth({
    plugins: [
        admin({
            ac,
            roles: {
                super_admin: superAdmin,
                admin: adminRole,
                user: userRole,
            },
            defaultRole: "user",
            adminRoles: ["admin", "super_admin"],
        })
    ]
});
```

#### Database Changes

Adds to `user` table:
- `role` (string, default "user")
- `banned` (boolean)
- `banReason` (string?)
- `banExpires` (date?)

Adds to `session` table:
- `impersonatedBy` (string?)

#### Making the First User Super Admin

Three approaches:

**Option 1: `adminUserIds`** (hardcoded by user ID)
```ts
admin({ adminUserIds: ["first-user-id-here"] })
```

**Option 2: Set role after registration** (programmatic)
```ts
await auth.api.setRole({
    body: { userId: "first-user-id", role: "super_admin" },
    headers: adminHeaders,
});
```

**Option 3: Database seed** (manual SQL)
```sql
UPDATE user SET role = 'super_admin' WHERE email = 'gavin@example.com';
```

#### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| Create user | POST | `authClient.admin.createUser({email, password, name, role})` |
| List users | GET | `authClient.admin.listUsers({limit, offset, searchField, searchValue})` |
| Set role | POST | `authClient.admin.setRole({userId, role})` |
| Ban user | POST | `authClient.admin.banUser({userId, banReason, banExpiresIn})` |
| Unban user | POST | `authClient.admin.unbanUser({userId})` |
| Remove user | POST | `authClient.admin.removeUser({userId})` |
| Impersonate | POST | `authClient.admin.impersonateUser({userId})` |
| List sessions | POST | `authClient.admin.listUserSessions({userId})` |
| Revoke session | POST | `authClient.admin.revokeUserSession({sessionToken})` |
| Revoke all | POST | `authClient.admin.revokeUserSessions({userId})` |

#### Permission Checking

```ts
// Client-side
const canImport = await authClient.admin.hasPermission({
    permissions: { fleet: ["import"] }
});

// Server-side
const canDelete = await auth.api.userHasPermission({
    body: {
        userId: "user-id",
        permissions: { fleet: ["delete"] }
    }
});
```

---

## 4. Frontend Client

### Creating the Client

```ts
// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
    baseURL: window.location.origin,
    plugins: [
        adminClient(),
        twoFactorClient({
            onTwoFactorRedirect: () => window.location.href = "/2fa",
        }),
        passkeyClient(),
    ],
});

export const { useSession, signIn, signUp, signOut } = authClient;
```

### React Integration

**useSession hook** (reactive, auto-updates on auth changes):

```tsx
import { authClient } from "../lib/auth-client";

function UserProfile() {
    const { data: session, isPending, error } = authClient.useSession();

    if (isPending) return <LoadingSpinner />;
    if (!session) return <LoginForm />;

    return (
        <div>
            <p>Welcome, {session.user.name}</p>
            <p>Role: {session.user.role}</p>
        </div>
    );
}
```

**No Context Provider needed**: Better Auth's React client uses `nanostores` internally. The `useSession` hook works anywhere in your component tree without a provider wrapper.

### OAuth Redirect Handling

```tsx
const handleGoogleSignIn = async () => {
    await authClient.signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
    });
};
```

---

## 5. Email Integration

Better Auth does NOT send emails itself. You provide callback functions:

### Email Verification + Password Reset via Resend

```ts
emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url, token }, request) => {
        void fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: "SC Companion <infrastructure@nerdz.cloud>",
                to: user.email,
                subject: "Verify your email address",
                html: `<p>Click <a href="${url}">here</a> to verify your email.</p>`,
            }),
        });
    },
    autoSignInAfterVerification: true,
},
emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url, token }, request) => {
        void fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: "SC Companion <infrastructure@nerdz.cloud>",
                to: user.email,
                subject: "Reset your password",
                html: `<p>Click <a href="${url}">here</a> to reset your password.</p>`,
            }),
        });
    },
},
```

---

## 6. Migration from Existing Schema

### Current Schema Analysis

The existing `users` table:
```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    handle TEXT,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Tables that reference `users.id`:
- `user_fleet` (user_id INTEGER FK)
- `user_paints` (user_id INTEGER FK)
- `user_llm_configs` (user_id INTEGER FK)
- `user_settings` (user_id INTEGER FK)

### Incompatibilities with Better Auth

| Issue | Current Schema | Better Auth Expects |
|-------|---------------|-------------------|
| ID type | `INTEGER AUTOINCREMENT` | `TEXT` (UUID string) |
| Email | Optional (`TEXT`) | Required (`TEXT NOT NULL`) |
| Name | `username` column | `name` column |
| Missing columns | -- | `emailVerified`, `image` |
| Password storage | Not in users table | In `account` table |

### Recommended Strategy: Fresh Start

Since this is transitioning from a single-user app to multi-user, and the user data is minimal:

1. Let Better Auth create its own `user`, `session`, `account`, `verification` tables
2. Add a migration that updates `user_fleet`, `user_paints`, etc. to reference the new `user` table with `TEXT` IDs
3. On first login, re-import fleet data from HangarXplor

---

## 7. Real-World Examples

### Reference Repositories

| Repository | Stack | Notes |
|-----------|-------|-------|
| [coji/hono-better-auth-d1](https://github.com/coji/hono-better-auth-d1) | Hono + Better Auth + D1 + React Router + Drizzle | Closest to SC Companion's target stack |
| [zpg6/better-auth-cloudflare](https://github.com/zpg6/better-auth-cloudflare) | Better Auth + D1/KV/R2 + Hono/Next.js | Comprehensive Cloudflare integration package |
| [alwaysnomads/better-hono](https://github.com/alwaysnomads/better-hono) | Hono + Better Auth + Drizzle + CF Workers | Minimal starter template |

---

## 8. Version, Stability & Ecosystem Health

| Metric | Value |
|--------|-------|
| **Stable version** | 1.4.18 |
| **GitHub stars** | 26,389 |
| **Weekly npm downloads** | ~611,000 |
| **License** | MIT |
| **Created** | May 2024 |
| **YC backed** | Yes ($5M seed) |

**Breaking changes policy**: Pin exact versions. Breaking changes have slipped into patch releases twice.

---

## 9. Critical Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| scrypt ~80ms CPU time on Workers | Use paid Workers plan (has `nodejs_compat`) or override with PBKDF2 |
| D1 binding not available at module level | Factory pattern: `createAuth(c.env)` per request |
| Breaking changes in patches | Pin exact version, test before upgrading |
| ID type mismatch with existing tables | Fresh start migration (Strategy A) |

---

## 10. Recommended Implementation Plan

### Phase 1: Foundation
1. Add dependencies: `better-auth`, `@better-auth/passkey`
2. Add `nodejs_compat` to `wrangler.toml`
3. Add `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` to secrets
4. Create `src/lib/auth.ts` with `createAuth(env)` factory
5. Mount auth handler at `/api/auth/*`
6. Create migration endpoint for D1 table creation

### Phase 2: Basic Auth
1. Email/password registration and login
2. Session middleware for all `/api/*` routes
3. Frontend auth client setup
4. Login / Register / Forgot Password pages
5. Email verification via Resend

### Phase 3: OAuth
1. Configure Google, GitHub, Facebook, Twitch as social providers
2. Account linking configuration
3. Update login page with social buttons

### Phase 4: Multi-User Migration
1. Migrate `user_fleet`, `user_paints`, etc. to use Better Auth user IDs
2. Update all API routes to scope queries by authenticated user
3. Admin plugin with RBAC
4. First-user-is-admin seeding logic

### Phase 5: Advanced Auth
1. 2FA/TOTP plugin
2. Passkey/WebAuthn plugin
3. Admin user management UI
4. Session management (list active sessions, revoke)

---

## Sources

- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Better Auth GitHub](https://github.com/better-auth/better-auth) (26.4k stars, MIT)
- [Hono + Better Auth on Cloudflare Example](https://hono.dev/examples/better-auth-on-cloudflare)
- [better-auth-cloudflare Package](https://github.com/zpg6/better-auth-cloudflare)
- [coji/hono-better-auth-d1](https://github.com/coji/hono-better-auth-d1)
- [pbkdf2-lite Package](https://github.com/jillesme/pbkdf2-lite)
- [Cloudflare Workers Node.js Crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)
- [Hashing Passwords on CF Workers](https://lord.technology/2024/02/21/hashing-passwords-on-cloudflare-workers.html)

---
---

# Better Auth Deep Security Assessment

**Date:** 2026-02-23
**Context:** Evaluating Better Auth for Star Citizen Fleet Manager on Cloudflare Workers
**Library Version Evaluated:** v1.5.0-beta.16 (canary), latest stable ~v1.4.x
**npm Weekly Downloads:** ~300,000+ (claimed 1.5M monthly at peak)

---

## Overall Security Verdict

**RECOMMENDATION: Acceptable for personal project use with caveats.**

Better Auth is a rapidly maturing library backed by YC funding ($5M seed), with an active maintainer and growing community. It has had real security vulnerabilities -- some serious -- but the response times have been excellent (patches within 24-48 hours). For a personal fleet manager that is not handling financial transactions or PII beyond email/password, the risk profile is acceptable.

**Risk Rating: MODERATE** -- Good for a personal project; would require additional hardening for production enterprise use.

---

## 1. Security Track Record

### Known CVEs and Security Advisories (9 total as of Feb 2026)

| Advisory | Severity | Description | Affected Versions | Fixed In | Date |
|----------|----------|-------------|-------------------|----------|------|
| GHSA-8jhw-6pjj-8723 (CVE-2024-56734) | HIGH | Open redirect in verify email endpoint | < 1.1.6 | 1.1.6 | Dec 2024 |
| GHSA-9x4v-xfq5-m8x5 | MODERATE | Reflected XSS via URL parameter HTML injection | 0.0.2 - 1.1.15 | 1.1.16 | Feb 2025 |
| GHSA-hjpm-7mrm-26w8 (CVE-2025-27143) | MODERATE | Open redirect via scheme-less callback (bypass of CVE-2024-56734 fix) | < 1.1.20 | 1.1.20 | Feb 2025 |
| GHSA-vp58-j275-797x | HIGH | Bypass trustedOrigins leading to Account Takeover | <= 1.1.20 | 1.1.21 | Feb 2025 |
| GHSA-36rg-gfq2-3h56 (CVE-2025-53535) | LOW | Open redirect in originCheck middleware (multiple routes) | <= 1.2.9 | 1.2.10 | Jul 2025 |
| GHSA-99h5-pjcv-gr6v (CVE-2025-61928) | **HIGH (CVSS 9.3)** | **Critical: Unauthenticated API key creation for arbitrary users** | < 1.3.26 | 1.3.26 | Oct 2025 |
| GHSA-wmjr-v86c-m9jj | LOW | Multi-session sign-out allows forged cookies to revoke arbitrary sessions | 1.3.34 - 1.3.x | 1.4.0 | Nov 2025 |
| GHSA-569q-mpph-wgww | LOW | External request basePath modification DoS | < 1.4.2 | 1.4.2 | Dec 2025 |
| GHSA-x732-6j76-qmhm | HIGH | rou3 double-slash path normalization bypasses disabledPaths and rate limits | < 1.4.5 | 1.4.5 | Dec 2025 |

### Analysis

**RED FLAG: The open redirect was fixed THREE TIMES** (CVE-2024-56734, CVE-2025-27143, CVE-2025-53535). The first fix was incomplete, the second fix was bypassed, and a third instance was found in different routes.

**RED FLAG: CVE-2025-61928 (CVSS 9.3)** was a fundamental authorization logic flaw in the API keys plugin -- unauthenticated attackers could create API keys for any user. Basic authorization check failure.

**POSITIVE: Response time is excellent.** CVE-2025-61928 was disclosed Oct 2, patched Oct 3 (next day). One security researcher noted "within 24 hours of reporting the vulnerability, it was patched."

**POSITIVE: Vulnerabilities are being found.** External researchers (ZeroPath, community members) are actively auditing the code.

### Relevance to Fleet Manager

- **API keys plugin (CVE-2025-61928):** We will NOT use the API keys plugin. Risk is low.
- **Open redirect vulns:** Matter for email verification flows. Ensure v1.4.5+.
- **Rate limit bypass (GHSA-x732):** Cloudflare URL normalization should mitigate.

---

## 2. Security Audits and Pen Testing

**No professional security audit has been conducted** despite $5M YC funding.

Better Auth has a [SECURITY.md](https://github.com/better-auth/better-auth/blob/main/SECURITY.md) with:
- **Email:** security@better-auth.com
- **Response SLA:** 72 hours
- **Disclosure timeline:** Public after patch; forced at 90 days
- **No monetary bug bounty program**

**CONCERN:** For an auth library with 300K+ weekly downloads and YC backing, no professional audit is a notable gap.

---

## 3. Cryptographic Implementation

### Password Hashing: scrypt via @noble/hashes

- **Parameters:** N=16384, r=16, p=1, dkLen=64
- **Salt:** 16 bytes from `crypto.getRandomValues()`, hex-encoded
- **Storage format:** `{salt_hex}:{key_hex}`
- **Unicode normalization:** NFKC applied before hashing
- **Timing attack protection:** Constant-time comparison via `constantTimeEqual()`
- **Cloudflare Workers:** ~80ms per hash (requires paid tier)

**Customizable** -- can override with PBKDF2 for edge runtimes.

### Symmetric Encryption: XChaCha20-Poly1305 via @noble/ciphers

- Used for TOTP secret encryption at rest
- Key: SHA-256 hash of `BETTER_AUTH_SECRET`
- Both @noble/hashes and @noble/ciphers are **Cure53-audited**

### Session Tokens

- Generated via `crypto.getRandomValues()` (CSPRNG)
- Rejection sampling for uniform distribution
- Character set: `[a-zA-Z0-9_-]` (64 chars = 6 bits per character)

### JWT: jose v6.1.0+

- Industry-standard JWT library by Filip Skokan
- HMAC-SHA256 for compact mode

---

## 4. Session Security

| Attribute | Default |
|-----------|---------|
| HttpOnly | Yes |
| Secure | Auto (yes for HTTPS) |
| SameSite | Lax |
| Signed | Yes (HMAC-SHA256) |
| Lifetime | 7 days |
| Sliding window | 1 day refresh |
| Session freshness | 5 minutes |

**Revocation:** Per-session, per-user (all except current), all sessions. Optional revoke on password change.

**Cookie caching caveat:** Revoked sessions remain active on other devices for up to 5 minutes (cache TTL).

---

## 5. OAuth Security

- **PKCE:** Yes, implemented with code verifier/challenge stored in DB
- **State parameter:** Yes, random per flow, stored in DB, validated on callback
- **Trusted origins:** Validated against configured `trustedOrigins` (historically buggy, now hardened in v1.4.5+)
- **Account linking:** Requires email verification by default

---

## 6. WebAuthn/Passkey Security

- **Library:** @simplewebauthn/server v13.1.2+ (gold standard, maintained by W3C WebAuthn WG member)
- **Challenge storage:** Cookie-based
- **Replay protection:** Handled by SimpleWebAuthn internals
- **Workers compatible:** Only needs SubtleCrypto for signature verification

---

## 7. Rate Limiting and Brute Force Protection

- **Built-in:** 200 requests / 5 minutes / IP (stricter on auth endpoints)
- **Storage:** Database by default (rateLimit table)
- **No account lockout:** IP-based only, no per-account lockout
- **No CAPTCHA integration**
- **Known bypass (fixed):** GHSA-x732 double-slash path bypass, fixed in v1.4.5

**Recommendation:** Layer Cloudflare WAF rate limiting on top for defense in depth.

---

## 8. Code Quality and Maintenance

| Metric | Value |
|--------|-------|
| Stars | 26,389 |
| Top contributor | Bekacru (3,050 commits) |
| Second contributor | himself65 (624 commits) |
| Contributors | 30+ |
| Bus factor | HIGH concern (single primary maintainer) |
| Auth.js merger | Expanded community and reduced fragmentation |
| Automated security scanning | None visible (no CodeQL/Dependabot) |

**Crypto dependencies are excellent:** Noble (Cure53-audited), jose, SimpleWebAuthn.

---

## 9. OWASP Alignment

| OWASP Recommendation | Better Auth Status |
|----------------------|-------------------|
| Strong password hashing | YES -- scrypt |
| Rate limiting | YES -- IP-based |
| Account lockout | NO -- not built-in |
| MFA support | YES -- TOTP, WebAuthn, backup codes |
| Session cookies: HttpOnly, Secure, SameSite | YES -- all three |
| Session invalidation on logout/password change | YES |
| CSRF protection | YES -- multi-layered |
| Redirect URL validation | YES -- trustedOrigins (historically buggy, now hardened) |

---

## Summary of Red Flags

1. No professional security audit despite $5M funding
2. Open redirect fixed three separate times
3. CVE-2025-61928 (CVSS 9.3) -- fundamental auth bypass in API keys plugin
4. High bus factor -- single primary maintainer
5. No automated security scanning visible in public repo
6. No account lockout mechanism
7. 649 open issues

## Summary of Strengths

1. Excellent vulnerability response time (24-48 hours)
2. High-quality crypto dependencies (Cure53-audited Noble, jose, SimpleWebAuthn)
3. Secure defaults (HttpOnly, Secure, SameSite=Lax, scrypt)
4. Multi-layered CSRF protection
5. PKCE + state for OAuth
6. TOTP secrets encrypted at rest (XChaCha20-Poly1305)
7. Active community finding and reporting vulnerabilities
8. YC backing and $5M funding
9. Auth.js merger -- de facto standard for TypeScript auth
10. Responsible disclosure policy with 72-hour SLA

---

## Recommendations for Fleet Manager

1. **Use Better Auth** -- security benefits over hand-rolling significantly outweigh risks
2. **Pin to v1.4.5+** minimum for all known security fixes
3. **Don't enable the API keys plugin** (where the critical CVE lived)
4. **Use paid Cloudflare Workers tier** for scrypt CPU time, or override with PBKDF2
5. **Enable Cloudflare URL normalization** to mitigate path normalization attacks
6. **Set `trustedOrigins` explicitly**
7. **Enable `revokeOtherSessions` on password change**
8. **Layer Cloudflare WAF rules** on top of Better Auth's rate limiting
9. **Monitor GitHub security advisories** for better-auth/better-auth

---

## Sources

### CVE and Advisory Sources
- [CVE-2025-61928 (ZeroPath writeup)](https://zeropath.com/blog/breaking-authentication-unauthenticated-api-key-creation-in-better-auth-cve-2025-61928)
- [CVE-2025-61928 (Snyk)](https://security.snyk.io/vuln/SNYK-JS-BETTERAUTH-13537497)
- [GHSA-x732-6j76-qmhm (GitHub Advisory)](https://github.com/advisories/GHSA-x732-6j76-qmhm)
- [GHSA-vp58-j275-797x (GitHub Advisory)](https://github.com/advisories/GHSA-vp58-j275-797x)
- [Better Auth Snyk vulnerability list](https://security.snyk.io/package/npm/better-auth)

### Documentation Sources
- [Better Auth Security Reference](https://www.better-auth.com/docs/reference/security)
- [Better Auth Session Management](https://www.better-auth.com/docs/concepts/session-management)
- [Better Auth SECURITY.md](https://github.com/better-auth/better-auth/blob/main/SECURITY.md)

### Community and News Sources
- [TechCrunch: Better Auth raises $5M](https://techcrunch.com/2025/06/25/this-self-taught-ethiopian-dev-built-an-authentication-tool-and-got-into-yc/)
- [Auth.js joins Better Auth](https://www.better-auth.com/blog/authjs-joins-better-auth)
- [HN: Launch HN Better Auth](https://news.ycombinator.com/item?id=44030492)

### Technical References
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Noble Hashes (Cure53-audited)](https://github.com/paulmillr/noble-hashes)
- [SimpleWebAuthn](https://simplewebauthn.dev/)
- [jose JWT library](https://github.com/panva/jose)

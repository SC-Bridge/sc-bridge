# Security Policy

## Supported versions

Only the current deployed version at [scbridge.app](https://scbridge.app) is supported.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting:
1. Go to the [Security tab](https://github.com/gavinmcfall/fleet-manager/security)
2. Click "Report a vulnerability"
3. Fill in the details — what you found, how to reproduce it, and what the impact might be

You'll receive a response within a few days. This project follows coordinated disclosure — vulnerabilities will be fixed before public disclosure.

## Scope

SC Bridge handles:
- User authentication (Better Auth, email + password, 2FA)
- User fleet data (ship names, insurance records)
- Public game reference data (ship stats, loot data from Star Citizen game files)

SC Bridge does **not** handle payments, financial data, or sensitive personal information beyond what's listed above.

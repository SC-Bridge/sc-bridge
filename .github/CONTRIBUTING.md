# Contributing to SC Bridge

SC Bridge is a solo hobby project. External contributions are welcome but the scope is deliberately narrow — this is a Star Citizen companion app, not a general-purpose tool.

## Ways to contribute

### Report bugs
Use the [Bug Report template](https://github.com/gavinmcfall/fleet-manager/issues/new?template=01-bug-report.yml). Include reproduction steps, your browser, and a screenshot if possible.

### Suggest features
[Ideas & Features](https://github.com/gavinmcfall/fleet-manager/discussions/categories/ideas-features) in Discussions is the right place. Upvote existing ideas before posting a new one.

### Code contributions
Not actively solicited — the codebase is moving fast and the cost of reviewing PRs currently exceeds the benefit. If you've spotted a clear bug and want to fix it, open an issue first to confirm it's the right fix before writing code.

## Tech stack

| Layer | Tech |
|-------|------|
| Backend | TypeScript, Hono, Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Frontend | React, Vite, Tailwind CSS |
| Auth | Better Auth |
| Deploy | GitHub Actions → `wrangler deploy` |

## Development

```bash
# Install dependencies
npm ci
cd frontend && npm ci && cd ..

# Type check
npm run typecheck

# Build frontend
cd frontend && npm run build && cd ..
```

Requires Node 22. Cloudflare account and D1 database not required for frontend-only changes.

## Code style

Match what's already there. No linting configuration is enforced — just keep it consistent with surrounding code.

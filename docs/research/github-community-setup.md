---
description: Survey of GitHub community and feedback features for managing a public beta — what each feature does, its tradeoffs, and what scbridge.app-specific constraints apply
tags: [github, community, beta, issues, discussions, projects, roadmap, automation]
audience: { human: 85, agent: 15 }
purpose: { research: 60, findings: 30, reference: 10 }
---

# GitHub Community Setup — Research

**Question:** What GitHub features are available for tracking issues, managing discussions, and publishing a roadmap — and what are the tradeoffs for a solo dev going public-facing with testers?

**Short answer:** GitHub provides a complete, free community stack (Issues + Discussions + Projects + community health files + automation) that covers every need for a public beta. The main decision axes are: how structured to make incoming feedback, how much automation to configure, and whether to expose a public roadmap at all.

---

## scbridge.app-specific constraints

These facts limit or shape what is available before any decision is made:

| Fact | Implication |
|------|-------------|
| Repo is on a **personal account** (`gavinmcfall`), not an org | Issue Types and Sub-issues (new 2025 GA features) are org-only — not available |
| Deploy workflow pushes **directly to `main`** (no PR-based workflow) | Auto-generated release notes from `.github/release.yml` require PRs to generate content — does not apply without workflow change |
| Repo is currently **private** | Making it public exposes all workflow YAMLs — review for hardcoded values before switching (there are none in the current deploy.yml, but worth verifying) |
| **GitHub Free** plan | 1 auto-add workflow per project (vs 5 on Pro) |

Sources: 📄 Code — `.github/workflows/deploy.yml` directly observed | 📚 [Issue Types docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization) | 📚 [Sub-issues org availability confirmed](https://github.com/orgs/community/discussions/175785)

---

## 1. Issues

### Two template formats coexist

**Markdown templates** (`.md`) pre-fill a text body. Contributors can delete everything and write freehand. No enforcement. Good as a fallback.

**YAML issue forms** (`.yml`) render as a structured web form with typed fields. Supports `required: true` validation that blocks submission until filled. Available field types:

| Type | Renders as | Can be required |
|------|-----------|----------------|
| `markdown` | Static instructional text (not submitted) | No |
| `input` | Single-line text box | Yes |
| `textarea` | Multi-line text; supports file attachment; `render:` attr for syntax highlighting | Yes |
| `dropdown` | Select menu; optionally multi-select | Yes |
| `checkboxes` | Checkbox list; individual checkboxes can be required | Per-checkbox |

YAML forms are newer. They can auto-apply labels, assignees, and (if org is used) issue types. They can also auto-add the new issue to a GitHub Project via the `projects:` key. Markdown templates cannot do the last two.

A **`config.yml`** file in `.github/ISSUE_TEMPLATE/` controls the template chooser:

```yaml
blank_issues_enabled: false   # forces template use; no freehand issues
contact_links:
  - name: Ask a question or share feedback
    url: https://github.com/gavinmcfall/fleet-manager/discussions
    about: Not a bug? Start a Discussion instead.
```

Setting `blank_issues_enabled: false` is the single most effective quality gate for incoming bug reports.

Source: 📚 [Syntax for issue forms](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms) | 📚 [Configuring issue templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository)

### Labels

GitHub creates 9 default labels on every new repo (`bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`). These are a starting point.

Labels serve two audiences at once: the maintainer triaging work, and the community contributor looking for status signals.

Three-tier strategy seen in active projects:

**Status tier** (workflow state — tells testers what's happening):
- `needs-triage` — newly opened, unreviewed
- `confirmed` — reproducible, will be addressed
- `in-progress` — actively being worked
- `wont-fix` — declined (add a comment explaining why)
- `duplicate` — already tracked elsewhere

**Type tier** (what kind of work):
- Keep the GitHub defaults: `bug`, `enhancement`, `question`, `documentation`

**Area tier** (which surface of the app):
- `area: fleet`, `area: loot`, `area: import`, `area: account`, `area: mobile`
- These are the labels that change how Issues filter meaningfully for scbridge.app specifically

Auto-applied labels on YAML templates (e.g., `labels: ["bug", "needs-triage"]`) must already exist in the repo or they are silently dropped.

Source: 📚 [Managing labels](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels)

### Milestones

Milestones group issues under a named goal with an optional due date. Each milestone shows a progress bar (closed/total issues).

Common pattern: `v0.5.0 — Beta Patch 2` as a milestone. Issues fixed in that release are assigned to it. The progress bar gives live release readiness signal. Milestone due date becomes a public commitment.

Milestones are per-repo, list-only, and have no automation. GitHub Projects is the more powerful tool — milestones are simpler and zero-config.

Source: 📚 [About milestones](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/about-milestones)

### Pinned issues

Up to 3 issues can be pinned above the issue list. These are the first thing testers see. Common uses: "Known issues in beta", "Welcome — how to report a bug".

As of February 2026, individual comments within an issue can also be pinned to the top of the thread. This means a "FIXED in v0.6.0" comment can be surfaced for long-running bug threads.

Source: 📚 [Pinning an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues/pinning-an-issue-to-your-repository) | 📚 [Pinned comments (Feb 2026)](https://github.blog/changelog/2026-02-05-pinned-comments-on-github-issues/)

### What is NOT available on a personal account

- **Issue Types** — org-managed classification system (Bug / Feature / Task). Org-only. Not available on personal repos as of March 2026.
- **Sub-issues** — parent-child issue hierarchy. Org-only. Same timeline.

Source: 📚 [Managing issue types — requires org](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization) | 🧠 [Community confirmation](https://github.com/orgs/community/discussions/175785)

---

## 2. Discussions

### Discussions vs Issues — the distinction

| Dimension | Issues | Discussions |
|-----------|--------|-------------|
| Purpose | Track discrete, actionable work | Open-ended conversation and community input |
| Lifecycle | Opens → worked on → closes | Can stay open indefinitely |
| Actionability | Concrete task | Exploration before commitment |
| Audience friction | Higher — implies technical bug report | Lower — feels like a forum post |

GitHub's own guidance: "Issues are for tracking tasks and defined pieces of work. Discussions are for conversations that need to be transparent and accessible but do not need to be tracked on a project board and are not directly related to code."

Direct observation of Star Citizen companion repos: ArkanisOverlay uses Discussions as the primary community entry point. SC Trade Companion has no feedback pathway at all and is weaker for it.

Source: 📚 [About discussions](https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/about-discussions) | 📄 [ArkanisOverlay repo examined](https://github.com/ArkanisCorporation/ArkanisOverlay)

### Category formats

Discussions supports up to 25 categories, each with one of four formats:

| Format | Who can create posts | Who can comment | Notes |
|--------|---------------------|-----------------|-------|
| Open-ended | Anyone | Anyone | Default general discussion |
| Q&A | Anyone | Anyone | Enables "Mark as answer" on any reply |
| Announcement | Maintainers/admins only | Anyone | The most important format — write-locked to you |
| Polls | Anyone | Anyone | Structured voting; up to 8 options; votes cannot be changed after casting |

The **Announcement** format is write-restricted automatically — no configuration required. Anyone can comment and react, but only you can post. Use this for patch notes, beta milestone updates, known issues.

The **Q&A** format enables the community to answer each other. You (or any triage-level contributor) can mark a reply as "The Answer," which surfaces it to the top of the thread. Over time this builds a persistent FAQ without you having to write one.

A five-category structure observed to work well for beta programs:

| Category | Format | Purpose |
|----------|--------|---------|
| Announcements | Announcement | Releases, known issues, beta milestones |
| Bug Reports | Open-ended | Player-reported issues (you triage → create Issue) |
| Ideas & Features | Open-ended | Wishlist, suggestions, emoji-reaction voting |
| Q&A | Q&A | "How do I use X" — community-answered |
| Show and Tell | Open-ended | Fleet screenshots, notable drops, community content |

**Pinning:** Up to 4 discussions can be globally pinned (above the full list) and another 4 can be pinned per category. Suggested global pins: "Welcome — how to give feedback", "Known issues in this beta".

Source: 📚 [Managing categories](https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-categories-for-discussions) | 📚 [Managing discussions](https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-discussions)

### Conversion between Discussions and Issues

- **Discussion → Issue**: A "Create issue from Discussion" button exists in the sidebar. Creates a new linked issue without deleting the discussion. Useful when a bug report in Discussions gets confirmed and needs tracking.
- **Issue → Discussion**: "Convert to discussion" in the issue sidebar. The issue is deleted; a discussion is created with the same content. Not reversible.
- **Cross-referencing**: Pasting a discussion URL in an issue body auto-links it. The `Fixes #N` closing syntax does not work across discussion-to-issue boundaries.

Status of "Create issue from Discussion": confirmed shipped in community threads; the exact UI entry point may vary by repo setup. 🧠

Source: 📚 [Moderating discussions](https://docs.github.com/en/discussions/managing-discussions-for-your-community/moderating-discussions) | 🧠 [Community thread](https://github.com/orgs/community/discussions/2861)

### Discussion templates

GitHub supports Discussion templates in `.github/DISCUSSION_TEMPLATE/` similar to issue templates. A Bug Reports Discussion category can have its own YAML form asking for browser, feature area, and description. This is separate from (and in addition to) issue templates.

Source: 📚 GitHub Community Health Files documentation (the specific `.github/DISCUSSION_TEMPLATE/` path is documented in community health file guidance)

---

## 3. GitHub Projects — Roadmap and Tracking

### Classic Projects are gone

Classic Projects (kanban boards tied to repos) were sunset on GitHub.com in August 2024. All classic projects were automatically migrated to Projects v2. The classic REST API is deprecated. Only Projects v2 exists now.

Source: 📚 [Sunset notice](https://github.blog/changelog/2024-05-23-sunset-notice-projects-classic/)

### Projects v2 capabilities

| Dimension | Detail |
|-----------|--------|
| Scope | User-level or org-level; crosses repo boundaries |
| Views | Table (spreadsheet), Board (kanban), Roadmap (Gantt timeline) |
| Custom fields | Up to 50 total; types: Text, Number, Date, Single select, Iteration |
| Item limit | 50,000 (raised from 1,200 in 2025) |
| Automation | Built-in workflows + GitHub Actions + GraphQL/REST API |
| Public visibility | Anonymous viewing without any GitHub account required |

Source: 📚 [About Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects)

### Public visibility — how it works

Project visibility has two values: Public or Private.

Critical nuance: **project visibility and item visibility are independent.** Setting a project to Public makes the project structure visible to anyone. But items (issues) are only visible if the repo they come from is also public. Items from a private repo are hidden from anonymous viewers even if the project is public.

For a public roadmap on a personal account:
- Set the project to **Public** (anonymous readers, no login required)
- Set the repo to **Public** (so issue content is visible)
- Testers do not need a GitHub account to view the project

Source: 📚 [Managing visibility of projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-your-project/managing-visibility-of-your-projects)

### Views

**Table view** — Spreadsheet. Every issue is a row, every field is a column. Supports sort, group, slice, field sums. Dense and filterable. Good for internal backlog management.

**Board view** — Kanban. Cards in columns driven by a single-select or iteration field (Status by default). Supports column WIP limits (visual warning only — does not block additions). Good for in-progress sprint view.

**Roadmap view** — Gantt timeline. Items plotted as horizontal bars between a Start date and a Target date. Zoom levels: Month, Quarter, Year. Groups/swim lanes supported. Items with no date set appear as dots or may be hidden.

Each project can have multiple saved views with independent configurations.

Source: 📚 [Roadmap layout](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-roadmap-layout) | 📚 [Table layout](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-table-layout) | 📚 [Board layout](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-board-layout)

### Field design for a public roadmap

Two competing field strategies are observed in real projects:

**Strategy A — Workflow status as roadmap status** (simple, one field)
Use the default Status single-select field with options like "Planned / In Progress / Shipped / Considering". This exposes internal workflow state publicly.

**Strategy B — Decouple delivery quarter from workflow status** (GitHub's own approach)
Use Status as a delivery quarter bucket ("Q2 2026", "Q3 2026", "Future") and a separate private field for internal workflow state. This is what GitHub's own public roadmap at [github.com/orgs/github/projects/4247](https://github.com/orgs/github/projects/4247) does.

Strategy B avoids the noise of "In Progress → Blocked → In Progress" status churn being visible to external users.

A practical field set for a public roadmap:

| Field | Type | Purpose |
|-------|------|---------|
| Status | Single select | Public delivery stage: Planned, In Progress, Shipped, Considering |
| Quarter | Single select | Delivery quarter: Q2 2026, Q3 2026, Future |
| Start Date | Date | When work begins (roadmap bar start) |
| Target Date | Date | Expected completion (roadmap bar end) |
| Area | Single select | Feature area: Fleet, Loot, Auth, Infra |

Source: 🧠 Synthesised from: 📚 [Single select fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-single-select-fields) | 📚 [Date fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-date-fields) | 👤 [GitHub's own public roadmap](https://github.com/orgs/github/projects/4247)

### Auto-add workflows

Built-in auto-add monitors a repo and adds matching items to the project automatically.

**GitHub Free limit: 1 auto-add workflow per project.**

Common approach on Free: one broad filter — `is:issue label:roadmap` — captures all roadmap-tagged issues.

Existing items at the time of enabling the workflow are not retroactively added.

Source: 📚 [Adding items automatically](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically)

### What to keep off the public roadmap

Observed pattern across OSS projects: internal tasks (DB migrations, CI fixes, refactoring) on a public roadmap create noise and erode trust when they appear to "stall". A separate private project for sprint/task tracking, with a public project showing only user-facing features, is the common approach.

Source: 🧠 Synthesised from GitHub's own roadmap structure + OSS project patterns

### Insights / charts

Projects v2 has built-in current and historical charts (burn-up, count by field, etc.).

**Gap:** Whether anonymous public viewers of a public project can access the Insights tab is not explicitly confirmed in the documentation reviewed. Charts may be visible only to logged-in project collaborators. **Confidence: Medium (unconfirmed).**

Source: 📚 [About insights](https://docs.github.com/en/issues/planning-and-tracking-with-projects/viewing-insights-from-your-project/about-insights-for-projects)

---

## 4. Community Health Files

GitHub scans for a specific set of files and surfaces them automatically in the UI. All can live in `.github/` (preferred), repo root, or `docs/`. When multiple locations contain the same file, `.github/` takes precedence.

| File | GitHub UI behavior |
|------|-------------------|
| `CONTRIBUTING.md` | Linked when anyone opens an Issue or PR |
| `CODE_OF_CONDUCT.md` | Shown in community profile checklist and sidebar |
| `SECURITY.md` | Adds "Report a vulnerability" button to Security tab |
| `SUPPORT.md` | Appears as "Helpful resources" link in Issues sidebar |
| `FUNDING.yml` | Powers the Sponsor button on the repo homepage |
| `.github/ISSUE_TEMPLATE/` | Issue template chooser |
| `.github/release.yml` | Auto-generated release note categories |
| `CODEOWNERS` | Automatic review request routing |

The community profile checklist is visible at `github.com/OWNER/REPO/community`. Maintainers see "Add" buttons for missing files; contributors see "Propose" buttons.

**Priority ordering for a beta launch:**

`SUPPORT.md` → `CONTRIBUTING.md` → `CODE_OF_CONDUCT.md` → `SECURITY.md`

**SUPPORT.md** is the highest leverage for beta: it tells non-technical testers where to go for help (Discussions, not email) and is linked directly from the Issues sidebar.

**SECURITY.md** enables private vulnerability reporting via GitHub's coordinated disclosure flow. For a companion app this is lower risk than a payment service, but it prevents security issues being opened as public issues.

Source: 📚 [Creating a default community health file](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file) | 📚 [About community profiles](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)

### Recommended `.github/` directory structure

```
.github/
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── SUPPORT.md
├── FUNDING.yml                     # optional — see Section 6
├── CODEOWNERS                      # optional for solo dev
│
├── ISSUE_TEMPLATE/
│   ├── config.yml                  # blank_issues_enabled: false + contact_links
│   ├── 01-bug-report.yml           # YAML form — structured bug intake
│   └── 02-feature-request.yml     # YAML form — feature suggestion
│
├── DISCUSSION_TEMPLATE/            # optional — mirrors issue forms for Discussions
│   └── bug-report.yml
│
├── PULL_REQUEST_TEMPLATE.md        # pre-populates PR description
│
├── release.yml                     # automated release note categories
│
└── workflows/
    ├── deploy.yml                  # existing
    ├── stale.yml                   # close inactive issues
    ├── labeler.yml                 # auto-label PRs by changed files
    └── greetings.yml               # welcome first-time contributors
```

Source: 🧠 Synthesised from all community health file and Actions documentation

---

## 5. Automation — GitHub Actions

Three official first-party Actions for community management (no third-party trust required):

### actions/stale — Close inactive issues

Runs on a schedule. Marks issues stale after N idle days, closes after additional M days unless activity resumes.

```yaml
# .github/workflows/stale.yml
name: Close Stale Issues
on:
  schedule:
    - cron: '0 2 * * *'
jobs:
  stale:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      pull-requests: write
    steps:
      - uses: actions/stale@v9
        with:
          days-before-stale: 60
          days-before-close: 14
          stale-issue-label: 'stale'
          exempt-issue-labels: 'pinned,confirmed,in-progress'
```

Key: `exempt-issue-labels` protects confirmed and active issues from getting closed by the bot.

Source: 📚 [actions/stale](https://github.com/actions/stale)

### actions/labeler — Auto-label PRs by changed files

Labels PRs based on which files changed. Useful if scbridge.app moves to a PR-based workflow.

```yaml
# .github/labeler.yml
area: loot:
  - changed-files:
      - any-glob-to-any-file: 'frontend/src/pages/LootDB.jsx'
area: fleet:
  - changed-files:
      - any-glob-to-any-file: 'frontend/src/pages/FleetTable.jsx'
database:
  - changed-files:
      - any-glob-to-any-file: 'src/db/**'
```

Uses `pull_request_target` trigger (not `pull_request`) so it has write permission from forks.

Source: 📚 [actions/labeler](https://github.com/actions/labeler)

### actions/first-interaction — Welcome new contributors

Posts a custom message when someone opens their first issue or PR. Reduces friction, sets expectations.

Source: 📚 [actions/first-interaction](https://github.com/actions/first-interaction)

### release.yml — Automated release notes

Maps PR labels to release note categories. When creating a release in the GitHub UI, clicking "Generate release notes" groups merged PRs by label category.

```yaml
# .github/release.yml
changelog:
  exclude:
    labels: [chore, ci, dependencies]
  categories:
    - title: New Features
      labels: [enhancement, feat]
    - title: Bug Fixes
      labels: [bug, fix]
    - title: Everything Else
      labels: ['*']
```

**Critical constraint for scbridge.app**: The current deploy workflow pushes directly to `main`. Auto-generated release notes are built from merged PRs. Without a PR-based workflow, this feature has no content to generate from. Switching to `main`-via-PR would unlock it.

Source: 📚 [Automatically generated release notes](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes) | 📄 Code — `.github/workflows/deploy.yml` observed

### Probot apps — assessment

Probot Stale is explicitly deprecated in favour of `actions/stale`. For a small project, GitHub Actions is the correct tool for all community automation. Probot requires self-hosting and is only worth the overhead for org-level event handling or a user-facing web UI.

Source: 📚 [probot/stale — deprecated](https://github.com/probot/stale) | 🧠 [Actions vs Probot comparison](https://jasonet.co/posts/probot-app-or-github-action-v2/)

---

## 6. Overlooked Features Worth Knowing

### Saved Replies (immediate win)

Pre-written responses that appear in a dropdown when composing any issue or PR comment, across all repos. Up to 100 replies per account.

Set up at [github.com/settings/replies](https://github.com/settings/replies) before the beta goes live. Common maintainer responses: "Known issue, tracked in #X", "Can you confirm your browser and the page you were on?", "Closing as duplicate of #X".

Source: 📚 [About saved replies](https://docs.github.com/en/get-started/writing-on-github/working-with-saved-replies/about-saved-replies)

### Traffic Insights — 14-day rolling window

Insights > Traffic shows views, unique visitors, referring sites, and popular content. Data is available via REST API at `/repos/{owner}/{repo}/traffic/views`. **The window is 14 days. Data older than 14 days is permanently lost unless exported.**

A GitHub Actions workflow running daily and committing the API response to a `data/` branch preserves this indefinitely. Losing launch day traffic is a common oversight.

Source: 📚 [Viewing traffic](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository) | 📚 [Traffic REST API](https://docs.github.com/en/rest/metrics/traffic) | 🧠 [Community archiving workflow](https://github.com/piebro/github-repo-traffic-stats)

### Code Permalinks

Pressing `y` while viewing any file upgrades the URL to a permanent link at the current commit SHA. Selecting a line range and copying the permalink renders as an inline code preview when pasted into an issue or PR comment **within the same repo**.

Useful when triaging a bug report — link directly to the relevant code path in your response.

Source: 📚 [Creating a permanent link to a code snippet](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-a-permanent-link-to-a-code-snippet)

### Closing keywords in PRs

Nine keywords (`close`, `closes`, `fix`, `fixes`, `fixed`, `resolve`, `resolves`, `resolved`, `closed`) followed by `#N` in a PR description automatically close the referenced issue when the PR merges — **but only when merging to the default branch**.

`Fixes #42` in every PR that addresses a bug report creates an automatic audit trail from tester-filed issue to shipped fix.

Source: 📚 [Using keywords in issues and PRs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/using-keywords-in-issues-and-pull-requests)

### FUNDING.yml — Sponsor button

A 5-minute addition that puts a "Sponsor" button on the repo homepage. Does not require a GitHub Sponsors profile — can point to Ko-fi, Patreon, Buy Me a Coffee, or up to 4 custom URLs. Requires the repo to be public.

```yaml
# .github/FUNDING.yml
ko_fi: yourusername
custom: ["https://buymeacoffee.com/yourlink"]
```

Source: 📚 [Displaying a sponsor button](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository)

### GitHub Wiki — skip it

The Wiki is not indexed by search engines until a repo has 500+ stars. It is disconnected from the PR and code review workflow, so anyone with write access can break it without review. For documentation, a `/docs` folder (versioned with code) or a GitHub Pages site is more maintainable.

Disable the Wiki in repo Settings to avoid an empty Wiki confusing testers who find it.

Source: 📚 [About wikis](https://docs.github.com/en/communities/documenting-your-project-with-wikis/about-wikis) | 🧠 [Wiki as antipattern](https://michaelheap.com/github-wiki-is-an-antipattern/)

### GitHub Pages — optional future

Free for public repos. Supports custom domains (e.g., `docs.scbridge.app` via CNAME). Can host a static changelog, FAQ, or feature overview for non-technical testers without requiring a GitHub account. Docusaurus (docs site with blog/changelog support) is the current community standard for project docs sites, deployed to Pages via Actions.

Source: 📚 [What is GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

### GitHub CLI (`gh`)

The `gh` CLI enables terminal-based issue management without the web UI. Relevant for a solo developer doing triage sessions:

```bash
gh issue list --assignee "@me"          # what's assigned to you
gh issue list --label "needs-triage"    # new incoming
gh issue view 42                        # read issue without browser
gh issue develop 42 -c                  # create linked branch for issue
gh run watch                            # watch CI live
```

Source: 📚 [gh CLI manual](https://cli.github.com/manual/gh_issue_create)

### GitHub Mobile

The GitHub Mobile app (iOS/Android) supports issue creation, commenting, labeling, and push notifications. Testers who receive a same-day acknowledgment are measurably more engaged than those who wait days. For a solo dev, mobile triage is the practical way to achieve this.

Source: 🧠 [GitHub Mobile changelog](https://github.blog/changelog/2025-02-28-mobile-monthly-februarys-general-availability-and-more/)

---

## 7. Public Changelog — Release Notes

The Keep a Changelog standard defines six categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Core principle: "Changelogs are for humans, not machines." Commit messages are not a changelog.

**GitHub Releases** is the primary surface for a public changelog — versioned, publicly visible without a login, appears on the repo homepage sidebar. Direct examination of VRChat Creator Companion (gaming companion app, active community) shows effective patterns:
- Player-addressed language: "You can now..." not "Added support for..."
- Categorical headers: "New Features / Changes / Bug Fixes"
- Links to issues by number (`#42`) creating a paper trail from report to fix

Combining GitHub Releases with a pinned Announcements discussion (mirroring the release notes) gives both the developer changelog surface and the community discussion surface in the same workflow.

**Auto-generated release notes** via `.github/release.yml` only work if commits reach `main` via merged PRs that carry labels. Not applicable to scbridge.app's current direct-push workflow without a workflow change.

Source: 📚 [Automatically generated release notes](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes) | 📚 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) | 📄 [VRChat Creator Companion releases](https://github.com/vrchat-community/creator-companion/releases) examined directly

---

## 8. README as the first contact surface

Direct examination of three real companion app repos (ArkanisOverlay, SC Trade Companion, VRChat Creator Companion) shows the README is the single highest-leverage document for non-technical testers.

Three questions that must be answerable in under 30 seconds:
1. "What is this?"
2. "Where do I report a problem?"
3. "Where do I suggest something?"

**ArkanisOverlay** (SC companion, Discussions-enabled): Gets the first question right with a clear purpose statement. Includes Discord and GitHub links. Does not have issue templates.

**SC Trade Companion** (SC companion, 369 stars): Good plain-language README. Has no visible feedback pathway. Non-technical users have no clear next step when something goes wrong.

The common failure mode in SC companion repos is treating the GitHub repo as code storage. Adding a beta status section and two explicit call-to-action links ("Found a bug? → link" and "Have an idea? → link") in the README addresses the gap that most companion repos have.

Source: 📄 [ArkanisOverlay README](https://github.com/ArkanisCorporation/ArkanisOverlay) directly examined | 📄 [SC Trade Companion README](https://github.com/EtienneLamoureux/sc-trade-companion) directly examined

---

## Gaps and unknowns

| Gap | Impact | Confidence |
|-----|--------|------------|
| Whether Insights/Charts tab is visible to anonymous public project viewers | Medium — affects whether burn-up charts are useful for public communication | Unconfirmed 🧠 |
| Whether `projects:` YAML key works for personal-account-level projects (not org) | Low-Medium — affects auto-add from templates | Unconfirmed (docs examples use org paths) 🧠 |
| Whether DISCUSSION_TEMPLATE forms are fully supported and GA | Low-Medium — alternative is just a category description | Not verified in primary docs 🧠 |
| What happens when GitHub extends Sub-issues and Issue Types to personal accounts | Medium — would change what's available without org setup | No announced timeline |
| Account friction barrier for non-developer SC players | Medium — a GitHub account is required to post; browsing is free. How many testers this eliminates would require user research | Not researchable via secondary sources |

---

## Sources

### GitHub Documentation
- [About issues](https://docs.github.com/en/issues/tracking-your-work-with-issues)
- [Syntax for issue forms](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
- [Configuring issue templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository)
- [Managing labels](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels)
- [About milestones](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/about-milestones)
- [About discussions](https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/about-discussions)
- [Managing categories for discussions](https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-categories-for-discussions)
- [Managing discussions](https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-discussions)
- [Moderating discussions](https://docs.github.com/en/discussions/managing-discussions-for-your-community/moderating-discussions)
- [Best practices for community conversations](https://docs.github.com/en/discussions/guides/best-practices-for-community-conversations-on-github)
- [About Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects)
- [Managing visibility of projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-your-project/managing-visibility-of-your-projects)
- [Adding items automatically](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically)
- [Roadmap layout](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-roadmap-layout)
- [Creating a default community health file](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file)
- [Automatically generated release notes](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes)
- [Pinning an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues/pinning-an-issue-to-your-repository)
- [Pinned comments (Feb 2026)](https://github.blog/changelog/2026-02-05-pinned-comments-on-github-issues/)
- [About saved replies](https://docs.github.com/en/get-started/writing-on-github/working-with-saved-replies/about-saved-replies)
- [Viewing traffic](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository)
- [Using keywords in issues and PRs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/using-keywords-in-issues-and-pull-requests)
- [Displaying a sponsor button (FUNDING.yml)](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository)
- [What is GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Managing issue types in an org](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization)
- [Sunset notice — Projects classic](https://github.blog/changelog/2024-05-23-sunset-notice-projects-classic/)
- [Evolving GitHub Issues — GA (Apr 2025)](https://github.blog/changelog/2025-04-09-evolving-github-issues-and-projects/)
- [actions/stale](https://github.com/actions/stale)
- [actions/labeler](https://github.com/actions/labeler)
- [actions/first-interaction](https://github.com/actions/first-interaction)
- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

### Real repos directly examined
- [ArkanisOverlay (Star Citizen companion)](https://github.com/ArkanisCorporation/ArkanisOverlay)
- [SC Trade Companion](https://github.com/EtienneLamoureux/sc-trade-companion)
- [VRChat Creator Companion — Releases](https://github.com/vrchat-community/creator-companion/releases)
- [GitHub's own public roadmap](https://github.com/orgs/github/projects/4247)

### Practitioner sources
- [Probot vs GitHub Actions](https://jasonet.co/posts/probot-app-or-github-action-v2/)
- [GitHub Discussions alternatives (featurebase.app)](https://www.featurebase.app/blog/github-discussions-alternatives)
- [Traffic archiving workflow](https://github.com/piebro/github-repo-traffic-stats)
- [GitHub Wiki as antipattern](https://michaelheap.com/github-wiki-is-an-antipattern/)

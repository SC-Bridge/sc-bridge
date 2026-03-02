---
description: Copy-paste opening posts for each SC Bridge Discussions category
tags: [github, community, beta, discussions]
audience: { human: 100, agent: 0 }
purpose: { reference: 100 }
---

# GitHub Discussions — Opening Posts

One post per category. Copy and paste each into the pinned post for that category.
Pin each one after posting (Discussions → ⋯ menu → Pin discussion).

---

## 1. Announcements — Welcome to the SC Bridge Beta

> **Category format:** Announcement (write-locked to you)
> **Pin this:** Yes — globally pin this one above all categories

---

```markdown
# Welcome to the SC Bridge Beta

SC Bridge is a Star Citizen companion app I've been building for myself that
I'm now opening up to other players. It lives at [scbridge.app](https://scbridge.app).

## What it does right now

- **Fleet** — import your ships from HangarXplor, track custom names, insurance
  types, and pledge details
- **Ship DB** — browse every flyable ship's specs, loadout slots, and default
  components. Click a component to see its stats.
- **Loot DB** — browse all 5,000+ lootable items in the game, filter by brand,
  type, and patch version, see where each item drops and which shops stock it
- **Analysis** — gap analysis of your fleet (firepower, cargo, salvage, medical)
  versus what you actually fly
- **Contracts** — reference list of all 81 in-game contracts
- **Organisations** — share your fleet with org members at different visibility
  levels (public / org / officers / private)

## What's rough right now

- Data is extracted from game files for **4.6.0-live**. It updates when I run
  the extraction scripts — not automatically on each patch.
- About 400 loot items (~7.5%) don't have full item details yet — they show
  as "Other" category. This is a data gap I'm working through.
- Mobile layout is functional but not polished.
- The app requires a GitHub account to file issues, but browsing doesn't
  require a login.

## How to give feedback

| If you... | Go to |
|-----------|-------|
| Found a bug | [File a bug report](https://github.com/gavinmcfall/fleet-manager/issues/new?template=01-bug-report.yml) |
| Have an idea | [Ideas & Features](https://github.com/gavinmcfall/fleet-manager/discussions/categories/ideas-features) |
| Have a question | [Q&A](https://github.com/gavinmcfall/fleet-manager/discussions/categories/q-a) |
| Hit a login or account issue | [Q&A](https://github.com/gavinmcfall/fleet-manager/discussions/categories/q-a) — include your browser |

I'll post patch notes and known issues here as the app evolves. Thanks for
testing — every report makes it better.
```

---

## 2. Bug Reports — How this category works

> **Category format:** Open-ended
> **Pin this:** Yes — pin within the Bug Reports category

---

```markdown
# How to report a bug

SC Bridge bug reports live in **GitHub Issues**, not here. Issues have a
structured form that makes bugs faster to reproduce and fix.

👉 **[File a bug report →](https://github.com/gavinmcfall/fleet-manager/issues/new?template=01-bug-report.yml)**

The form asks for:
- Which part of the app is affected
- What happened vs what you expected
- Steps to reproduce
- Your browser and device

---

**Use this Discussions category** if you're not sure whether something is a
bug or expected behaviour — describe what you saw and I'll either confirm it
as a bug and open a tracked issue, or explain what's going on.

---

## What SC Bridge doesn't control

SC Bridge displays data extracted from Star Citizen's game files. If ship
stats, prices, or loot tables look wrong, that's the game data as it stands
for the current patch. Game balance and content bugs belong at the
[RSI Issue Council](https://issue-council.robertsspaceindustries.com/).
```

---

## 3. Ideas & Features — How suggestions work

> **Category format:** Open-ended
> **Pin this:** Yes — pin within the Ideas & Features category

---

```markdown
# How feature suggestions work

This is the right place for ideas — new features, things you wish worked
differently, data you'd like to see added.

## Before posting

Search this category first. If your idea is already here, **upvote it**
(👍 reaction on the original post) rather than creating a duplicate. Reaction
counts are how I gauge demand across a large backlog.

## What to include

The more specific the better. "Better loot filtering" is hard to act on.
"Filter loot by item size so I can quickly find what fits my armour slot" is
something I can build.

If another tool (SC Trade Companion, Erkul, UEX) does something similar,
link it — seeing how something works elsewhere is useful context.

## What's already on the radar

These are features I intend to build, roughly in order:

- **Points of Interest** — clickable location chips in Loot DB linking to a
  dedicated location page showing all loot at that site
- **Paint browser** — view and compare ship paint variants
- **Org settings** — update your org RSI SID and social links
- **Stats for helmets, clothing, attachments** — DataCore extraction is done,
  data display pending
- **Shopping list location names** — container keys currently show raw
  DataCore IDs; friendly names coming

## What's out of scope

SC Bridge is a companion app, not a game overlay or real-time tool. It won't
track live ship positions, display radar data, or interface with the game
directly. Ideas in that direction won't be considered.
```

---

## 4. Q&A — Welcome

> **Category format:** Q&A (enables Mark as Answer)
> **Pin this:** Yes — pin within the Q&A category

---

```markdown
# Welcome to Q&A

Ask anything about SC Bridge here — how to use it, what a field means,
why something looks a certain way.

## How Q&A works

Any reply can be marked as **The Answer** — either by me or by whoever
asked. Once marked, the answer floats to the top of the thread. If you
search later and find a thread where your question was already answered,
the answer is the first reply you see.

The community can answer questions too. If you know the answer to
something, go for it.

## Common starting questions

**How do I import my fleet?**
Export your hangar from [HangarXplor](https://hangarxplor.space/) as JSON,
then go to Import in SC Bridge and drop the file in. It replaces your
current fleet completely on each import.

**Why does my ship show the wrong insurance?**
HangarXplor reads your RSI account data. If it's wrong there, it'll be
wrong here. Check your pledge in your RSI account first.

**Why is a ship missing from Ship DB?**
SC Bridge includes flyable ships for the current patch (4.6.0-live). Concept
ships and unflown pledges aren't in the database yet.

**The loot item I'm looking for shows "Other" with no details.**
About 400 items (~7.5%) don't have full detail data yet — mostly missiles,
eyewear, and a few clothing items. This is a known data gap.
```

---

## 5. Show and Tell — Welcome

> **Category format:** Open-ended
> **Pin this:** Optional — only if you want to prime it with a first post

---

```markdown
# Show and Tell

Share anything SC Bridge-related here.

Fleet screenshots, loadout setups you're proud of, notable loot drops,
an org fleet breakdown that surprised you — whatever's worth sharing with
other players.

No format required. This is the unstructured corner of the community.

---

I'll kick it off: here's my fleet as of 4.6.0. 38 ships, two of which
have names that are definitely not Star Trek references.
```

> **Note:** The last line is a placeholder — replace with your actual fleet
> screenshot or a real detail about your setup before posting.

---

## After posting — checklist

- [ ] Announcements post published and globally pinned
- [ ] Bug Reports guidance post published and pinned within category
- [ ] Ideas & Features guidance post published and pinned within category
- [ ] Q&A welcome post published and pinned within category
- [ ] Show and Tell post published (optional: pin)
- [ ] `needs-triage`, `confirmed`, `in-progress`, `area:*` labels created in Issues before any bug reports come in
- [ ] Saved Replies set up at [github.com/settings/replies](https://github.com/settings/replies)

---
description: Copy-paste opening posts for each SC Bridge Discussions category
tags: [github, community, beta, discussions]
audience: { human: 100, agent: 0 }
purpose: { reference: 100 }
---

# GitHub Discussions — Opening Posts

## Setup order

1. Go to repo **Settings → Features → Discussions** — verify it's enabled
2. Go to **Discussions → Categories (pencil icon)** to manage categories
3. Add the custom **Bug Reports** category (see below)
4. Rename **Ideas** description to match your post (optional)
5. Post and pin each opening post below

---

## Adding the Bug Reports custom category

In Discussions, click the pencil icon next to "Categories", then **New category**:

| Field | Value |
|-------|-------|
| Category name | Bug Reports |
| Description | Not sure if something is broken? Describe it here. |
| Emoji | 🐛 |
| Format | Open-ended discussion |

Save. It will appear in the category list. You can drag it to reorder — put it after Announcements.

---

## Final category list (in order)

| # | Category | Format | Opening post |
|---|----------|--------|--------------|
| 1 | Announcements | Announcement (write-locked) | Yes — globally pin |
| 2 | Bug Reports | Open-ended | Yes — pin within category |
| 3 | General | Open-ended | Yes — pin within category |
| 4 | Ideas | Open-ended | Yes — pin within category |
| 5 | Polls | Polls | No post needed |
| 6 | Q&A | Q&A (Answers enabled) | Yes — pin within category |
| 7 | Show and tell | Open-ended | Yes — pin within category |

---

## 1. Announcements

> Globally pin this one (appears above all categories for every visitor)

---

```markdown
# Welcome to the SC Bridge Beta

SC Bridge is a Star Citizen companion app I've been building for myself that
I'm now opening up to other players. It lives at [scbridge.app](https://scbridge.app).

## What it does right now

- **Fleet** — import your ships from HangarXplor, track custom names,
  insurance types, and pledge details
- **Ship DB** — browse every flyable ship's specs, loadout slots, and
  default components. Click a component to see its stats.
- **Loot DB** — browse 5,000+ lootable items, filter by brand, type, and
  patch version, see where each drops and which shops stock it
- **Analysis** — gap analysis of your fleet (firepower, cargo, salvage,
  medical) versus what you actually fly
- **Contracts** — reference list of all 81 in-game contracts
- **Organisations** — share your fleet with org members at different
  visibility levels (public / org / officers / private)

## What's rough right now

- Data is extracted from game files for **4.6.0-live** and updates when I
  run the extraction scripts — not automatically on each patch
- About 400 loot items (~7.5%) show as "Other" with no detail — this is a
  known data gap I'm working through
- Mobile layout is functional but not polished

## How to give feedback

| Situation | Where to go |
|-----------|-------------|
| Something is broken | [Bug Reports](https://github.com/gavinmcfall/fleet-manager/discussions/categories/bug-reports) → confirmed bugs become tracked Issues |
| Idea or suggestion | [Ideas](https://github.com/gavinmcfall/fleet-manager/discussions/categories/ideas) |
| Question about how to use it | [Q&A](https://github.com/gavinmcfall/fleet-manager/discussions/categories/q-a) |
| General chat | [General](https://github.com/gavinmcfall/fleet-manager/discussions/categories/general) |

I'll post patch notes and known issues here as things evolve. Thanks for
testing — every report makes it better.
```

---

## 2. Bug Reports

> Pin within Bug Reports category

---

```markdown
# How bug reports work here

Use this category if something in SC Bridge looks wrong and you're not sure
whether it's a bug or expected behaviour. Describe what you saw and I'll
either confirm it and open a tracked issue, or explain what's going on.

For clear, reproducible bugs, filing directly in Issues gets a faster
response because it has a structured form:

👉 **[File a bug report in Issues →](https://github.com/gavinmcfall/fleet-manager/issues/new?template=01-bug-report.yml)**

The form asks for your browser, reproduction steps, and a screenshot —
the things that make a bug actually fixable.

---

## What SC Bridge doesn't control

SC Bridge displays data extracted from Star Citizen's game files. If ship
stats, prices, or loot tables look wrong, that's the game data as it stands
for the current patch. Game balance issues belong at the
[RSI Issue Council](https://issue-council.robertsspaceindustries.com/).
```

---

## 3. General

> Pin within General category

---

```markdown
# General

The open floor. Anything SC Bridge-related that doesn't fit the other
categories lives here.

Talking through a workflow, not sure where to post something, want to
share something that isn't quite Show and Tell — this is the right spot.

A few things with dedicated homes:
- Bug or something broken → [Bug Reports](https://github.com/gavinmcfall/fleet-manager/discussions/categories/bug-reports)
- Feature suggestion → [Ideas](https://github.com/gavinmcfall/fleet-manager/discussions/categories/ideas)
- Question about how to use something → [Q&A](https://github.com/gavinmcfall/fleet-manager/discussions/categories/q-a)
- Fleet screenshots, notable drops → [Show and tell](https://github.com/gavinmcfall/fleet-manager/discussions/categories/show-and-tell)
```

---

## 4. Ideas

> Pin within Ideas category

---

```markdown
# How feature suggestions work

Got an idea? This is the right place.

## Before posting

Search this category first. If your idea is already here, **react with 👍**
on the original post rather than creating a duplicate. Reaction counts are
how I gauge demand across a large backlog.

## What to include

Specific is better. "Better loot filtering" is hard to act on.
"Filter loot by item size so I can quickly find what fits my armour slot"
is something I can build.

If another tool (SC Trade Companion, Erkul, UEX) does something similar,
link it — seeing how it works elsewhere is useful context.

## What's already on the radar

- **Points of Interest** — clickable location links in Loot DB leading to
  a dedicated page showing all loot at that site
- **Paint browser** — view and compare ship paint variants
- **Org settings** — update your org's RSI SID and social links
- **Item stats for helmets, clothing, attachments** — extraction done,
  display pending
- **Shopping list location names** — friendly names for all container
  location keys

## What's out of scope

SC Bridge is a companion app, not an overlay or real-time tool. It won't
track live ship positions, display radar, or interface with the game
directly.
```

---

## 5. Polls

> No opening post needed — GitHub shows a blank "Start a discussion" prompt.
> Use polls when you want community input on a prioritisation question.

**Example poll topics to run when the time comes:**
- "Which feature should I build next?" (list 3–4 roadmap items as options)
- "How do you primarily use SC Bridge?" (fleet tracking / loot research / ship browsing / all of it)
- "What's your biggest pain point right now?"

Polls accept up to 8 options and votes cannot be changed after casting.

---

## 6. Q&A

> Pin within Q&A category

---

```markdown
# Welcome to Q&A

Ask anything about SC Bridge here — how to use a feature, what a field
means, why something looks a certain way.

## How it works

Any reply in this category can be marked as **The Answer**. Once marked,
the answer floats to the top of the thread. If you search later, you see
the answer first. The community can mark answers too — if you know the
answer to something, go for it.

---

## Common questions

**How do I import my fleet?**
Export your hangar from [HangarXplor](https://hangarxplor.space/) as JSON,
then go to Import in SC Bridge and drop the file in. It replaces your
fleet completely on each import — there's no merge.

**Why does my ship show the wrong insurance?**
HangarXplor reads your RSI account data. If it's wrong there, it'll be
wrong here. Check your pledge in your RSI account first.

**Why is a ship missing from Ship DB?**
SC Bridge covers flyable ships for 4.6.0-live. Concept ships and unflown
pledges aren't in the database yet.

**A loot item shows "Other" with no details — is that a bug?**
No — about 400 items (~7.5%) don't have full detail data yet. Mostly
missiles, eyewear, and a few clothing items. Known gap, being worked on.
```

---

## 7. Show and Tell

> Pin within Show and Tell category (optional — only if you post first)

---

```markdown
# Show and Tell

Share anything worth sharing.

Fleet screenshots, loadout setups you're happy with, a loot run that paid
off, an org fleet breakdown that surprised you — whatever's worth showing
other players.

No format required. This is the unstructured corner.
```

---

## Post-setup checklist

### GitHub UI steps
- [ ] Bug Reports custom category created (Open-ended format, 🐛 emoji)
- [ ] All 7 opening posts published
- [ ] Announcements post globally pinned
- [ ] Bug Reports, General, Ideas, Q&A, Show and tell posts pinned within their category

### Before going public
- [ ] Labels created in Issues: `needs-triage`, `confirmed`, `in-progress`, `stale`, `area: fleet`, `area: loot`, `area: ship-db`, `area: import`, `area: account`, `data`, `patch-data`
- [ ] Saved Replies set up at [github.com/settings/replies](https://github.com/settings/replies)
  - "Known issue, tracked in #N"
  - "Can you confirm your browser and what you were doing when this happened?"
  - "Closing as duplicate of #N"
  - "Thanks — this is game data as-is for 4.6.0. If the game has the wrong value, the RSI Issue Council is the right place."
- [ ] `data/traffic` branch: first traffic-archive workflow run after repo goes public

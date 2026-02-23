# SC Bridge Themes

CSS-only themes for SC Bridge. Each theme redefines the same Tailwind tokens and component classes — zero JSX changes required.

## Available Themes

| # | Theme | Vibe | Primary Color |
|---|-------|------|---------------|
| 01 | **Mobiglas HUD** | Ship terminal, scan-lines, cyan glow | `#00e5ff` cyan |
| 03 | **Erkul Technical** | Ultra-clean, data-dense, zero effects | `#60a5fa` ice blue |
| 04 | **UEX Data Terminal** | Warm amber commodity terminal | `#f59e0b` amber |
| 06 | **Military Command** | Battleship bridge, thick borders, green phosphor | `#4ade80` military green |
| 10 | **Retro CRT Terminal** | Green-on-black, scanlines, pixel font | `#33ff33` phosphor green |

## How to Swap Themes

Each theme folder contains 3 files that replace originals:

| Theme File | Replaces | What It Changes |
|------------|----------|-----------------|
| `tailwind.config.js` | `frontend/tailwind.config.js` | Color tokens, font stacks |
| `index.css` | `frontend/src/index.css` | Component styles, effects, backgrounds |
| `index.html` | `frontend/index.html` | Google Fonts links |

### Quick Swap (shell)

```bash
# Apply a theme
THEME="theme-01-mobiglas-hud"
cp frontend/themes/$THEME/tailwind.config.js frontend/tailwind.config.js
cp frontend/themes/$THEME/index.css frontend/src/index.css
cp frontend/themes/$THEME/index.html frontend/index.html

# Preview
cd frontend && npm run dev
```

### Revert to Default

```bash
cd frontend && git checkout tailwind.config.js src/index.css index.html
```

### Shell Helper Function

Add to your `.bashrc` / `.zshrc`:

```bash
fleet-theme() {
  local base="/home/gavin/my_other_repos/fleet-manager"
  local theme="$1"

  if [ -z "$theme" ]; then
    echo "Available themes:"
    ls "$base/frontend/themes/" | grep "^theme-"
    return 0
  fi

  # Allow short names: "01" → "theme-01-mobiglas-hud"
  local match=$(ls "$base/frontend/themes/" | grep "^theme-${theme}")
  if [ -z "$match" ]; then
    echo "No theme matching: $theme"
    return 1
  fi

  echo "Applying: $match"
  cp "$base/frontend/themes/$match/tailwind.config.js" "$base/frontend/tailwind.config.js"
  cp "$base/frontend/themes/$match/index.css" "$base/frontend/src/index.css"
  cp "$base/frontend/themes/$match/index.html" "$base/frontend/index.html"
  echo "Done. Run 'cd $base/frontend && npm run dev' to preview."
}
```

Usage:
```bash
fleet-theme              # List all themes
fleet-theme 01           # Apply Mobiglas HUD
fleet-theme 10           # Apply Retro CRT Terminal
fleet-theme revert       # (won't match — use git checkout instead)
```

## What Each Theme Modifies

All themes define the same classes — they just look different:

**Tailwind tokens:** `sc-dark`, `sc-darker`, `sc-panel`, `sc-border`, `sc-accent`, `sc-accent2`, `sc-warn`, `sc-danger`, `sc-success`, `sc-lti`, `sc-melt`

**Font families:** `font-display`, `font-body`, `font-mono`

**Component classes:** `.panel`, `.panel-header`, `.badge`, `.badge-lti`, `.badge-nonlti`, `.badge-warbond`, `.badge-size`, `.stat-card`, `.stat-value`, `.stat-label`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`, `.table-header`, `.table-cell`, `.glow-line`

**Added in all themes:** `.btn-secondary` (used in ShipDB.jsx but was missing from original CSS)

## Design Notes

- Themes are standalone — pick one, copy 3 files, done
- No runtime theme switching (yet) — this is a workshop for visual evaluation
- Hardcoded Recharts tooltip colors in Dashboard.jsx (`#111827`, `#1e293b`) won't change with themes
- Each theme's `PREVIEW.md` has full palette table, font choices, and effect descriptions

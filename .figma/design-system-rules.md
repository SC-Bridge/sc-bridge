# SC Bridge Design System Rules

## Framework & Build
- **Framework:** React 18 (JSX, functional components, hooks)
- **Styling:** Tailwind CSS 3.4 (utility-first, custom theme)
- **Build:** Vite 6
- **Icons:** Lucide React (stroke icons, typically `w-3.5 h-3.5` or `w-4 h-4`)

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `sc-dark` | `#0a0e17` | Page background base |
| `sc-darker` | `#060a12` | Deeper background, sidebar |
| `sc-panel` | `#111827` | Card/panel backgrounds |
| `sc-border` | `#1e293b` | Borders, dividers |
| `sc-accent` | `#38bdf8` | Primary accent (sky blue) |
| `sc-accent2` | `#818cf8` | Secondary accent (indigo) |
| `sc-warn` | `#f59e0b` | Warnings, non-LTI insurance |
| `sc-danger` | `#ef4444` | Errors, high priority |
| `sc-success` | `#22c55e` | Success states |
| `sc-lti` | `#a78bfa` | Lifetime insurance (purple) |
| `sc-melt` | `#fb923c` | Melt/trade value (orange) |

Background gradient: `linear-gradient(135deg, #060a12 0%, #0a0e17 50%, #0d1321 100%)`

## Typography

| Role | Font Family | Fallbacks |
|------|-------------|-----------|
| `font-display` | Orbitron | Rajdhani, sans-serif |
| `font-body` | Rajdhani | Inter, sans-serif |
| `font-mono` | JetBrains Mono | Fira Code, monospace |

### Type Scale (common patterns)
- **Page title:** `font-display font-bold text-2xl tracking-wider text-white` (UPPERCASE)
- **Section header:** `font-display font-semibold text-sm uppercase tracking-widest text-gray-400`
- **Body text:** `text-sm text-gray-400`
- **Label:** `text-xs font-mono uppercase tracking-wider text-gray-500`
- **Stat value:** `text-2xl font-display font-bold`
- **Code/data:** `text-sm font-mono text-gray-300`

## Component Library

All shared components live in `frontend/src/components/`.

### PageHeader
**File:** `frontend/src/components/PageHeader.jsx`
**Props:** `title` (string), `subtitle` (string), `actions` (ReactNode), `divider` (bool, default true)
**Usage:** Top of every page. Title is uppercase display font. Optional subtitle in mono. Optional right-aligned actions. Glow-line divider below.

### LoadingState
**File:** `frontend/src/components/LoadingState.jsx`
**Props:** `message` (string, default "Loading..."), `fullScreen` (bool, default false)
**Usage:** Centered spinner with message. `fullScreen` uses `min-h-screen` (for Suspense fallback), default uses `h-64`.

### ErrorState
**File:** `frontend/src/components/ErrorState.jsx`
**Props:** `message` (string)
**Usage:** Red mono text prefixed with "Error:". Padding p-8.

### PanelSection
**File:** `frontend/src/components/PanelSection.jsx`
**Props:** `title` (string), `icon` (LucideIcon), `children` (ReactNode), `className` (string)
**Usage:** Panel card with optional header. Uses `.panel` and `.panel-header` CSS classes. Icon renders at `w-3.5 h-3.5` when provided.

### StatCard
**File:** `frontend/src/components/StatCard.jsx`
**Props:** `icon` (LucideIcon), `label` (string), `value` (string|number), `color` (string, default "text-white"), `accentBorder` (string)
**Usage:** Compact metric card. Uses `.stat-card`, `.stat-label`, `.stat-value` CSS classes. `accentBorder` adds left border (e.g., `border-l-sc-lti`).

### FilterSelect
**File:** `frontend/src/components/FilterSelect.jsx`
**Props:** `value` (string), `onChange` (fn), `options` (array of strings or `{value, label}` objects), `allLabel` (string), `className` (string)
**Usage:** Styled select dropdown. Handles both simple string arrays (with "all" → allLabel mapping) and object arrays.

### SearchInput
**File:** `frontend/src/components/SearchInput.jsx`
**Props:** `value` (string), `onChange` (fn), `placeholder` (string, default "Search..."), `className` (string)
**Usage:** Input with Search icon on the left. `className` controls wrapper width (e.g., `max-w-sm`, `max-w-md`).

### InsuranceBadge
**File:** `frontend/src/components/InsuranceBadge.jsx`
**Props:** `isLifetime` (bool), `label` (string)
**Usage:** Renders LTI badge (purple), non-LTI badge (gray), or em-dash when no label. Uses `.badge`, `.badge-lti`, `.badge-nonlti` CSS classes.

### EmptyState
**File:** `frontend/src/components/EmptyState.jsx`
**Props:** `message` (string), `icon` (LucideIcon), `large` (bool, default false)
**Usage:** Centered message in a panel. `large` with icon shows bigger padding and `w-12 h-12` icon.

### AlertBanner
**File:** `frontend/src/components/AlertBanner.jsx`
**Props:** `variant` ("info"|"success"|"error"|"warning"), `icon` (LucideIcon), `children` (ReactNode)
**Usage:** Panel with left accent border. Variant controls border and icon color. Icon auto-colored to match variant.

## CSS Layer Classes

Defined in `frontend/src/index.css` under `@layer components`:

| Class | Applies |
|-------|---------|
| `.panel` | `bg-sc-panel/80 backdrop-blur-sm border border-sc-border rounded-lg` |
| `.panel-header` | `px-5 py-3 border-b border-sc-border font-display font-semibold text-sm uppercase tracking-widest text-gray-400` |
| `.badge` | `inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium` |
| `.badge-lti` | `bg-sc-lti/20 text-sc-lti border border-sc-lti/30` |
| `.badge-nonlti` | `bg-gray-700/50 text-gray-400 border border-gray-600/30` |
| `.badge-warbond` | `bg-sc-warn/20 text-sc-warn border border-sc-warn/30` |
| `.badge-size` | `bg-sc-accent/10 text-sc-accent border border-sc-accent/20` |
| `.stat-card` | `panel p-4 flex flex-col gap-1` |
| `.stat-value` | `text-2xl font-display font-bold text-white` |
| `.stat-label` | `text-xs font-mono uppercase tracking-wider text-gray-500` |
| `.btn` | `px-4 py-2 rounded font-display font-semibold text-sm uppercase tracking-wider transition-all duration-200` |
| `.btn-primary` | `btn bg-sc-accent/20 text-sc-accent border border-sc-accent/40 hover:bg-sc-accent/30 hover:border-sc-accent/60` |
| `.btn-danger` | `btn bg-sc-danger/20 text-sc-danger border border-sc-danger/40 hover:bg-sc-danger/30` |
| `.btn-ghost` | `btn text-gray-400 hover:text-white hover:bg-white/5` |
| `.table-header` | `text-xs font-mono uppercase tracking-wider text-gray-500 text-left px-3 py-2` |
| `.table-cell` | `px-3 py-2.5 text-sm border-t border-sc-border/50` |
| `.glow-line` | `h-px bg-gradient-to-r from-transparent via-sc-accent/40 to-transparent` |

## Page Structure

All pages follow the same layout pattern:
```jsx
<div className="space-y-6"> {/* or space-y-4 */}
  <PageHeader title="..." subtitle="..." />
  {/* Page content */}
</div>
```

Pages are rendered inside `<main className="flex-1 overflow-auto"><div className="max-w-7xl mx-auto p-6">`.

## Sidebar
- Width: `w-56` (14rem)
- Background: `bg-sc-darker/80`
- Nav items use `font-display tracking-wide text-xs uppercase`
- Active state: `bg-sc-accent/10 text-sc-accent border border-sc-accent/20`
- Hover state: `text-gray-300 bg-white/5`

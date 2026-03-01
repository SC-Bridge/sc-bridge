# Coming Soon Mode — Revert Guide

The app is in coming-soon mode. Registration, Ship DB, stat counts, and all content pages
are hidden from unauthenticated users. All routes and backend logic remain intact — nothing was deleted.

**To fully re-open the app, apply all six diffs below.**

---

## 1. `frontend/src/pages/Dashboard.jsx`

**Find** (the landing page CTA section):
```jsx
          <div className="flex items-center justify-center gap-3 mb-8">
            <Link to="/login" className="btn-primary inline-flex items-center gap-2 px-6 py-2.5">
              <LogIn className="w-4 h-4" /> Sign In
            </Link>
          </div>
          <p className="text-xs text-gray-600 font-display tracking-widest uppercase">
            Coming Soon — Registration opening shortly
          </p>
```

**Replace with:**
```jsx
          <div className="flex items-center justify-center gap-3 mb-8">
            <Link to="/login" className="btn-primary inline-flex items-center gap-2 px-6 py-2.5">
              <LogIn className="w-4 h-4" /> Sign In
            </Link>
            <Link to="/register" className="inline-flex items-center gap-2 px-6 py-2.5 border border-sc-border rounded text-gray-300 hover:text-white hover:bg-white/5 transition-colors font-display tracking-wider uppercase text-sm">
              Create Account
            </Link>
          </div>
```

---

## 2. `frontend/src/pages/Login.jsx`

**Find** (just before the closing `</div></div></div>`):
```jsx
        </div>
      </div>
    </div>
  )
}
```

**Insert before the final closing tags:**
```jsx
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Don't have an account?{' '}
              <Link to="/register" className="text-sc-accent hover:text-sc-accent/80 transition-colors">
                Register
              </Link>
            </p>
          </div>
```

---

## 3. `frontend/src/App.jsx`

**Find** (the sidebar unauthenticated section, after the Sign In NavLink):
```jsx
          <NavLink
            to="/login"
            onClick={onNavClick}
            className="btn-primary w-full py-2 font-display tracking-wider uppercase text-xs flex items-center justify-center gap-2"
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign In
          </NavLink>
        </div>
```

**Replace with:**
```jsx
          <NavLink
            to="/login"
            onClick={onNavClick}
            className="btn-primary w-full py-2 font-display tracking-wider uppercase text-xs flex items-center justify-center gap-2"
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign In
          </NavLink>
          <NavLink
            to="/register"
            onClick={onNavClick}
            className="w-full py-2 font-display tracking-wider uppercase text-xs flex items-center justify-center gap-2 border border-sc-border rounded text-gray-400 hover:text-gray-300 hover:bg-white/5 transition-colors"
          >
            Create Account
          </NavLink>
        </div>
```

---

## 4. `frontend/src/App.jsx` — Restore public nav items

**Find:**
```js
const publicNavItems = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
]
```

**Replace with:**
```js
const publicNavItems = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/ships', icon: Database, label: 'Ship DB' },
  { to: '/loot', icon: Search, label: 'Item Finder' },
  { to: '/contracts', icon: FileText, label: 'Contracts' },
]
```

---

## 5. `frontend/src/pages/Dashboard.jsx` — Restore stat cards

**Find** (after the coming-soon text, before the closing `</div>` of the landing section):
```jsx
      </div>
    )
  }
```

**Insert the stat cards before those closing tags:**
```jsx
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="panel p-6 bg-grid">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-4 h-4 text-sc-accent" />
              <span className="stat-label">Ship Database</span>
            </div>
            <p className="text-4xl font-display font-bold text-white mb-2">{status?.ships || 0}</p>
            <p className="text-sm text-gray-500">Ships synced from SC Wiki</p>
            <Link to="/ships" className="inline-flex items-center gap-1 mt-3 text-xs text-sc-accent hover:text-sc-accent/80 transition-colors font-display tracking-wider uppercase">
              Browse Ships
            </Link>
          </div>
          <div className="panel p-6 bg-grid">
            <div className="flex items-center gap-2 mb-3">
              <Rocket className="w-4 h-4 text-sc-accent2" />
              <span className="stat-label">Paint Library</span>
            </div>
            <p className="text-4xl font-display font-bold text-white mb-2">{status?.paints || 0}</p>
            <p className="text-sm text-gray-500">Ship paints catalogued</p>
          </div>
        </div>
```

---

## 6. `frontend/src/App.jsx` — Restore public routes

**Find** (inside the inner `<Routes>` block):
```jsx
                      {/* Protected routes */}
                      <Route path="/ships" element={<RequireAuth><ShipDB /></RequireAuth>} />
                      <Route path="/ships/:slug" element={<RequireAuth><ShipDetail /></RequireAuth>} />
                      <Route path="/loot" element={<RequireAuth><LootDB /></RequireAuth>} />
                      <Route path="/contracts" element={<RequireAuth><Contracts /></RequireAuth>} />
```

**Replace with:**
```jsx
                      {/* Public content routes */}
                      <Route path="/ships" element={<ShipDB />} />
                      <Route path="/ships/:slug" element={<ShipDetail />} />
                      <Route path="/loot" element={<LootDB />} />
                      <Route path="/contracts" element={<Contracts />} />

                      {/* Protected routes */}
```

**Also find:**
```jsx
                      <Route path="/orgs/:slug" element={<RequireAuth><OrgProfile /></RequireAuth>} />
```

**Replace with:**
```jsx
                      <Route path="/orgs/:slug" element={<OrgProfile />} />
```

---

## Notes

- The `/register` route was never removed — direct URL still works.
- Social login buttons on the Login page also create accounts — these were not changed.
- Better Auth's backend `signUp` endpoint was not touched.
- All changes are purely cosmetic UI hiding.
- The `/api/*` fallthrough in `src/index.ts` (JSON 404 for unhandled API paths) is a bug fix — do NOT revert it.

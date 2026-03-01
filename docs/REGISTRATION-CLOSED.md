# Registration Closed — Revert Guide

Registration is currently hidden from the UI. The `/register` route and all account creation
logic still exist and work — it's just not linked from anywhere visible.

**To re-enable registration, apply the three diffs below.**

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

## Notes

- The `/register` route itself was never removed — anyone with the direct URL can still register.
- Social login buttons on the Login page also create accounts — these were not changed.
- Better Auth's backend `signUp` endpoint was not touched.
- This change is purely cosmetic UI hiding.

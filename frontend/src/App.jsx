import React, { useState, Suspense, lazy } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Rocket, BarChart3, Shield, Upload, RefreshCw, Database, Settings as SettingsIcon, ChevronDown, ChevronRight, History, Menu, X, LogOut, LogIn, User, Wrench, Users, Building2 } from 'lucide-react'
import LoadingState from './components/LoadingState'
import ErrorBoundary from './components/ErrorBoundary'
import RequireAuth from './components/RequireAuth'
import useFontPreference from './hooks/useFontPreference'
import { authClient, useSession, signOut } from './lib/auth-client'
import { TimezoneProvider } from './hooks/useTimezone'

import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'

const FleetTable = lazy(() => import('./pages/FleetTable'))
const Insurance = lazy(() => import('./pages/Insurance'))
const Analysis = lazy(() => import('./pages/Analysis'))
const AnalysisHistory = lazy(() => import('./pages/AnalysisHistory'))
const Import = lazy(() => import('./pages/Import'))
const ShipDB = lazy(() => import('./pages/ShipDB'))
const Settings = lazy(() => import('./pages/Settings'))
const Admin = lazy(() => import('./pages/Admin'))
const UserManagement = lazy(() => import('./pages/UserManagement'))
const Account = lazy(() => import('./pages/Account'))
const TwoFactorVerify = lazy(() => import('./pages/TwoFactorVerify'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))
const Orgs = lazy(() => import('./pages/Orgs'))
const OrgProfile = lazy(() => import('./pages/OrgProfile'))
const AcceptInvitation = lazy(() => import('./pages/AcceptInvitation'))

const publicNavItems = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/ships', icon: Database, label: 'Ship DB' },
]

const authNavItems = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/fleet', icon: Rocket, label: 'Fleet' },
  { to: '/insurance', icon: Shield, label: 'Insurance' },
  {
    to: '/analysis',
    icon: RefreshCw,
    label: 'Analysis',
    submenu: [
      { to: '/analysis', icon: RefreshCw, label: 'Current' },
      { to: '/analysis/history', icon: History, label: 'History' },
    ],
  },
  { to: '/ships', icon: Database, label: 'Ship DB' },
  { to: '/import', icon: Upload, label: 'Import' },
  { to: '/settings', icon: SettingsIcon, label: 'Settings' },
  { to: '/orgs', icon: Building2, label: 'Orgs' },
]

const adminNavItems = [
  { to: '/admin', icon: Wrench, label: 'Admin' },
]

const superAdminNavItems = [
  { to: '/users', icon: Users, label: 'Users' },
]

function getNavItems(role, isLoggedIn) {
  if (!isLoggedIn) return [...publicNavItems]
  const items = [...authNavItems]
  if (role === 'admin' || role === 'super_admin') {
    items.push(...adminNavItems)
  }
  if (role === 'super_admin') {
    items.push(...superAdminNavItems)
  }
  return items
}

function SidebarContent({ expandedMenu, setExpandedMenu, onNavClick }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user
  const userRole = session?.user?.role || 'user'
  const navItems = getNavItems(userRole, isLoggedIn)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <>
      <div className="p-5 border-b border-sc-border">
        <h1 className="font-display font-bold text-lg tracking-wider text-sc-accent flex items-center gap-2">
          <img src="/logo.png" alt="" className="w-6 h-6" aria-hidden="true" />
          SC BRIDGE
        </h1>
        <p className="text-xs font-mono text-gray-500 mt-1 tracking-widest">STAR CITIZEN COMPANION</p>
      </div>
      <div className="flex flex-col gap-0.5 p-2 flex-1" role="list">
        {navItems.map((item) => {
          const { to, icon: Icon, label, submenu } = item
          const hasSubmenu = submenu && submenu.length > 0
          const isParentActive = location.pathname.startsWith(to)
          const isExpanded = expandedMenu === to

          if (hasSubmenu) {
            return (
              <div key={to} role="listitem">
                <button
                  onClick={() => setExpandedMenu(isExpanded ? null : to)}
                  aria-expanded={isExpanded}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-all duration-150 ${
                    isParentActive
                      ? 'bg-sc-accent/10 text-sc-accent border-l-2 border-l-sc-accent border-r border-t border-b border-sc-accent/20'
                      : 'text-gray-400 hover:text-gray-300 hover:bg-white/5 hover:translate-x-0.5 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  <span className="font-display tracking-wide text-xs uppercase flex-1 text-left">{label}</span>
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="w-3 h-3" aria-hidden="true" />
                  )}
                </button>

                {isExpanded && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-sc-border pl-2" role="list">
                    {submenu.map((sub) => (
                      <NavLink
                        key={sub.to}
                        to={sub.to}
                        end
                        role="listitem"
                        onClick={onNavClick}
                        className={({ isActive }) =>
                          `flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition-all duration-150 ${
                            isActive
                              ? 'bg-sc-accent/10 text-sc-accent'
                              : 'text-gray-400 hover:text-gray-300 hover:bg-white/5 hover:translate-x-0.5'
                          }`
                        }
                      >
                        <sub.icon className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="font-display tracking-wide uppercase">{sub.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              role="listitem"
              onClick={onNavClick}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-sc-accent/10 text-sc-accent border-l-2 border-l-sc-accent border-r border-t border-b border-sc-accent/20'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-white/5 hover:translate-x-0.5 border border-transparent'
                }`
              }
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span className="font-display tracking-wide text-xs uppercase">{label}</span>
            </NavLink>
          )
        })}
      </div>

      {/* User info + sign out / Sign in CTA */}
      {isLoggedIn ? (
        <div className="p-3 border-t border-sc-border">
          <div className="flex items-center gap-2 px-2 py-2">
            <NavLink
              to="/account"
              onClick={onNavClick}
              className="flex items-center gap-2 flex-1 min-w-0 hover:text-gray-300 transition-colors"
            >
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover shrink-0 border border-sc-border"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : (
                <User className="w-4 h-4 text-gray-500 shrink-0" />
              )}
              <span className="text-xs text-gray-400 truncate">{session.user.name || session.user.email}</span>
            </NavLink>
            <button
              onClick={handleSignOut}
              className="text-gray-500 hover:text-gray-300 transition-colors shrink-0"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 border-t border-sc-border space-y-2">
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
      )}

      <div className="p-3 border-t border-sc-border">
        <p className="text-[11px] font-mono text-gray-500 text-center tracking-widest">
          v2.0.0 · NZVengeance
        </p>
        <p className="text-[10px] text-gray-600 text-center mt-1">
          <NavLink to="/privacy" className="hover:text-gray-400 transition-colors">Privacy</NavLink>
          {' · '}
          <NavLink to="/terms" className="hover:text-gray-400 transition-colors">Terms</NavLink>
        </p>
      </div>
    </>
  )
}

function ImpersonationBanner() {
  const { data: sessionData } = useSession()
  const isImpersonating = !!sessionData?.session?.impersonatedBy
  if (!isImpersonating) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-4 px-4 py-2 bg-amber-500 text-amber-950 text-sm font-medium">
      <span>
        Impersonating: <strong>{sessionData.user.name || sessionData.user.email}</strong>
      </span>
      <button
        onClick={async () => {
          await authClient.admin.stopImpersonating()
          window.location.href = '/users'
        }}
        className="px-3 py-1 bg-amber-950/20 hover:bg-amber-950/30 rounded text-xs font-display tracking-wide uppercase transition-colors"
      >
        Stop Impersonating
      </button>
    </div>
  )
}

export default function App() {
  useFontPreference()
  const [expandedMenu, setExpandedMenu] = useState('/analysis')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <TimezoneProvider>
    <Routes>
      {/* Public auth routes — no sidebar */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/2fa" element={<Suspense fallback={<LoadingState fullScreen />}><TwoFactorVerify /></Suspense>} />
      <Route path="/verify-email" element={<Suspense fallback={<LoadingState fullScreen />}><VerifyEmail /></Suspense>} />
      <Route path="/privacy" element={<Suspense fallback={<LoadingState fullScreen />}><Privacy /></Suspense>} />
      <Route path="/terms" element={<Suspense fallback={<LoadingState fullScreen />}><Terms /></Suspense>} />
      <Route path="/accept-invitation" element={<Suspense fallback={<LoadingState fullScreen />}><AcceptInvitation /></Suspense>} />

      {/* App routes — with sidebar layout */}
      <Route
        path="*"
        element={
          <div className="min-h-screen flex">
            <ImpersonationBanner />
            {/* Skip navigation link */}
            <a href="#main-content" className="skip-link">
              Skip to content
            </a>

            {/* Desktop sidebar */}
            <nav className="hidden md:flex w-56 bg-sc-darker/80 border-r border-sc-border flex-col shrink-0 sticky top-0 h-screen" aria-label="Main">
              <SidebarContent
                expandedMenu={expandedMenu}
                setExpandedMenu={setExpandedMenu}
                onNavClick={() => {}}
              />
            </nav>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="md:hidden fixed top-4 left-4 z-40 p-2 rounded bg-sc-panel border border-sc-border text-gray-400 hover:text-white transition-colors"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Mobile slide-over sidebar */}
            {mobileMenuOpen && (
              <div
                className="md:hidden fixed inset-0 z-50 flex"
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                onClick={() => setMobileMenuOpen(false)}
              >
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
                <nav
                  className="relative w-64 bg-sc-darker border-r border-sc-border flex flex-col animate-fade-in"
                  aria-label="Main"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Close navigation menu"
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" aria-hidden="true" />
                  </button>
                  <SidebarContent
                    expandedMenu={expandedMenu}
                    setExpandedMenu={setExpandedMenu}
                    onNavClick={() => setMobileMenuOpen(false)}
                  />
                </nav>
              </div>
            )}

            {/* Main content */}
            <main id="main-content" className="flex-1 overflow-auto" tabIndex={-1}>
              <div className="max-w-7xl mx-auto p-6 md:p-6 pt-16 md:pt-6">
                <ErrorBoundary>
                  <Suspense fallback={<LoadingState fullScreen />}>
                    <Routes>
                      {/* Public routes */}
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/ships" element={<ShipDB />} />

                      {/* Protected routes */}
                      <Route path="/fleet" element={<RequireAuth><FleetTable /></RequireAuth>} />
                      <Route path="/insurance" element={<RequireAuth><Insurance /></RequireAuth>} />
                      <Route path="/analysis" element={<RequireAuth><Analysis /></RequireAuth>} />
                      <Route path="/analysis/history" element={<RequireAuth><AnalysisHistory /></RequireAuth>} />
                      <Route path="/import" element={<RequireAuth><Import /></RequireAuth>} />
                      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
                      <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
                      <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
                      <Route path="/users" element={<RequireAuth><UserManagement /></RequireAuth>} />
                      <Route path="/orgs" element={<RequireAuth><Orgs /></RequireAuth>} />
                      <Route path="/orgs/:slug" element={<OrgProfile />} />
                    </Routes>
                  </Suspense>
                </ErrorBoundary>
              </div>
            </main>
          </div>
        }
      />
    </Routes>
    </TimezoneProvider>
  )
}

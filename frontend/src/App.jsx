import React, { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Rocket, BarChart3, Shield, Upload, RefreshCw, Database, Settings as SettingsIcon, ChevronDown, ChevronRight, ChevronLeft, History, Menu, X, LogOut, LogIn, User, Wrench, Users, Building2, FileText, Search, MapPin, Palette, ShoppingCart, Hammer, Briefcase, Scale, Crosshair, BookOpen, Layers, TrendingUp, Languages, Heart, FlaskConical, SlidersHorizontal, Bookmark, Sparkles, Shirt, Zap, Thermometer, Gauge, Radar, Target, Navigation, Package, Wallet, BookMarked, ClipboardList, Coins, LineChart, ArrowRightLeft } from 'lucide-react'
import LoadingState from './components/LoadingState'
import ErrorBoundary from './components/ErrorBoundary'
import RequireAuth from './components/RequireAuth'
import RequireFeature from './components/RequireFeature'
import SortingNavBadge from './pages/Accountant/SortingNavBadge'
import LoansNavBadge from './pages/Accountant/LoansNavBadge'
import { TIER_RANK } from './pages/Accountant/constants'
import useFontPreference from './hooks/useFontPreference'
import { useStatus, usePreferences, setPreferences } from './hooks/useAPI'
import { authClient, useSession, signOut } from './lib/auth-client'
import { TimezoneProvider } from './hooks/useTimezone'
import { PrivacyModeProvider } from './hooks/usePrivacyMode'

import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

const FleetTable = lazy(() => import('./pages/FleetTable'))
const Hangar = lazy(() => import('./pages/Hangar'))
const Insurance = lazy(() => import('./pages/Insurance'))
const Insights = lazy(() => import('./pages/Insights'))
const Analysis = lazy(() => import('./pages/Analysis'))
const AnalysisHistory = lazy(() => import('./pages/AnalysisHistory'))
const Import = lazy(() => import('./pages/Import'))
const ShipDB = lazy(() => import('./pages/ShipDB'))
const ShipDetail = lazy(() => import('./pages/ShipDetail'))
const Settings = lazy(() => import('./pages/Settings'))
const Admin = lazy(() => import('./pages/Admin'))
const UserManagement = lazy(() => import('./pages/UserManagement'))
const Account = lazy(() => import('./pages/Account'))
const TwoFactorVerify = lazy(() => import('./pages/TwoFactorVerify'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const Privacy = lazy(() => import('./pages/Privacy'))
const PublicFleet = lazy(() => import('./pages/PublicFleet'))
const Terms = lazy(() => import('./pages/Terms'))
const CodeSigning = lazy(() => import('./pages/CodeSigning'))
const Orgs = lazy(() => import('./pages/Orgs'))
const OrgProfile = lazy(() => import('./pages/OrgProfile'))
const OrgSettings = lazy(() => import('./pages/OrgSettings'))
const OpDetail = lazy(() => import('./pages/OrgOps/OpDetail'))
const JoinOp = lazy(() => import('./pages/JoinOp'))
const AcceptInvitation = lazy(() => import('./pages/AcceptInvitation'))
const Missions = lazy(() => import('./pages/Missions'))
const LootDB = lazy(() => import('./pages/LootDB'))
const FullItemDetail = lazy(() => import('./pages/LootDB/FullItemDetail'))
const POI = lazy(() => import('./pages/POI'))
const POIDetail = lazy(() => import('./pages/POIDetail'))
const POIChildren = lazy(() => import('./pages/POIChildren'))
const PaintBrowser = lazy(() => import('./pages/PaintBrowser'))
const PaintDetail = lazy(() => import('./pages/PaintDetail'))
const ArmorSetDetail = lazy(() => import('./pages/ArmorSetDetail'))
const Shops = lazy(() => import('./pages/Shops'))
const TradeCommodities = lazy(() => import('./pages/TradeCommodities'))
const Mining = lazy(() => import('./pages/Mining'))
const MiningElementDetail = lazy(() => import('./pages/Mining/ElementDetail'))
const MiningLocationDetail = lazy(() => import('./pages/Mining/LocationDetail'))
const MiningEquipmentDetail = lazy(() => import('./pages/Mining/EquipmentDetail'))
const Crafting = lazy(() => import('./pages/Crafting/v2'))
const BlueprintDetail = lazy(() => import('./pages/Crafting/BlueprintDetail'))
const QualitySimPage = lazy(() => import('./pages/Crafting/QualitySimPage'))
const SavedBlueprints = lazy(() => import('./pages/Crafting/SavedBlueprints'))
const MissionDetail = lazy(() => import('./pages/MissionDetail'))
const FactionDetail = lazy(() => import('./pages/FactionDetail'))
const Careers = lazy(() => import('./pages/Careers'))
const LawSystem = lazy(() => import('./pages/LawSystem'))
const NPCLoadouts = lazy(() => import('./pages/NPCLoadouts'))
const LocalizationBuilder = lazy(() => import('./pages/LocalizationBuilder'))
const Loadout = lazy(() => import('./pages/Loadout'))
const Components = lazy(() => import('./pages/Components'))
const FpsLoadout = lazy(() => import('./pages/FpsLoadout'))
const About = lazy(() => import('./pages/About'))
const NotFound = lazy(() => import('./pages/NotFound'))
const AccountantSettings = lazy(() => import('./pages/Accountant'))
const AccountantLedger = lazy(() => import('./pages/Accountant/Ledger'))
const AccountantSorting = lazy(() => import('./pages/Accountant/Sorting'))
const AccountantLoans = lazy(() => import('./pages/Accountant/Loans'))
const AccountantLoanDetail = lazy(() => import('./pages/Accountant/Loans/LoanDetail'))
const AccountantTactical = lazy(() => import('./pages/Accountant/Tactical'))
const AccountantReports = lazy(() => import('./pages/Accountant/Reports'))
const AccountantReportPL = lazy(() => import('./pages/Accountant/Reports/PL'))
const AccountantReportBalance = lazy(() => import('./pages/Accountant/Reports/BalanceSheet'))
const AccountantReportNetWorth = lazy(() => import('./pages/Accountant/Reports/NetWorth'))
const AccountantReportCashFlow = lazy(() => import('./pages/Accountant/Reports/CashFlow'))

// Game Data and Reference are public — visible to all users
const gameDataGroup = {
  group: 'Game Data',
  icon: Crosshair,
  items: [
    { to: '/loot', icon: Search, label: 'Item Finder' },
    { to: '/poi', icon: MapPin, label: 'Locations' },
    { to: '/missions', icon: FileText, label: 'Missions' },
    { to: '/shops', icon: ShoppingCart, label: 'Shops' },
    { to: '/trade', icon: TrendingUp, label: 'Trade' },
    { to: '/mining', icon: Hammer, label: 'Mining Guide' },
    {
      to: '/crafting',
      icon: FlaskConical,
      label: 'Crafting',
      submenu: [
        { to: '/crafting', icon: FlaskConical, label: 'Blueprints' },
        { to: '/crafting/sim', icon: SlidersHorizontal, label: 'Quality Sim' },
        { to: '/crafting/saved', icon: Bookmark, label: 'My Blueprints', auth: true },
      ],
    },
    { to: '/npc-loadouts', icon: Users, label: 'NPC Loadouts' },
  ],
}

const referenceGroup = {
  group: 'Reference',
  icon: BookOpen,
  items: [
    { to: '/ships', icon: Database, label: 'Ship DB' },
    { to: '/paints', icon: Palette, label: 'Paints' },
    { to: '/careers', icon: Briefcase, label: 'Careers & Roles' },
    { to: '/law', icon: Scale, label: 'Law System' },
    {
      to: '/components',
      icon: Layers,
      label: 'Components',
      submenu: [
        { to: '/components/weapons', icon: Crosshair, label: 'Weapons' },
        { to: '/components/shields', icon: Shield, label: 'Shields' },
        { to: '/components/coolers', icon: Thermometer, label: 'Coolers' },
        { to: '/components/power-plants', icon: Zap, label: 'Power Plants' },
        { to: '/components/quantum-drives', icon: Navigation, label: 'Quantum Drives' },
        { to: '/components/turrets', icon: Target, label: 'Turrets' },
        { to: '/components/missiles', icon: Rocket, label: 'Missiles' },
        { to: '/components/sensors', icon: Radar, label: 'Sensors' },
      ],
    },
  ],
}

const publicNavItems = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  gameDataGroup,
  referenceGroup,
]

const authNavItems = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  gameDataGroup,
  {
    group: 'My Fleet',
    icon: Rocket,
    items: [
      { to: '/fleet', icon: Rocket, label: 'Fleet' },
      { to: '/hangar', icon: Package, label: 'Hangar' },
      { to: '/insurance', icon: Shield, label: 'Insurance' },
      {
        to: '/analysis',
        icon: BarChart3,
        label: 'Analysis',
        submenu: [
          { to: '/insights', icon: BarChart3, label: 'Insights' },
          { to: '/analysis', icon: Sparkles, label: 'AI Analysis' },
          { to: '/analysis/history', icon: History, label: 'History' },
        ],
      },
      { to: '/fps-loadout', icon: Shirt, label: 'FPS Loadout', featureFlag: 'fpsLoadout' },
      { to: '/localization', icon: Languages, label: 'Localization' },
      { to: '/sync-import', icon: Upload, label: 'Sync & Import' },
    ],
  },
  referenceGroup,
  { to: '/settings', icon: SettingsIcon, label: 'Settings' },
  {
    group: 'Accountant',
    icon: Wallet,
    items: [
      { to: '/accountant/settings', icon: SettingsIcon, label: 'Settings' },
      {
        to: '/accountant/ledger',
        icon: BookMarked,
        label: 'Core Financials',
        minTier: 'easy',
        submenu: [
          { to: '/accountant/ledger', icon: BookMarked, label: 'Ledger' },
          { to: '/accountant/sorting', icon: ClipboardList, label: 'Sorting List', badge: 'sorting' },
        ],
      },
      {
        to: '/accountant/loans',
        icon: Briefcase,
        label: 'Finance',
        minTier: 'industrial',
        submenu: [
          { to: '/accountant/loans', icon: Coins, label: 'Loans', badge: 'loans' },
          { to: '/accountant/tactical', icon: Target, label: 'Tactical' },
        ],
      },
      {
        to: '/accountant/reports',
        icon: BarChart3,
        label: 'Reports',
        minTier: 'industrial',
        submenu: [
          { to: '/accountant/reports', icon: BarChart3, label: 'Overview' },
          { to: '/accountant/reports/pl', icon: TrendingUp, label: 'P&L' },
          { to: '/accountant/reports/balance', icon: Scale, label: 'Balance Sheet' },
          { to: '/accountant/reports/net-worth', icon: LineChart, label: 'Net Worth' },
          { to: '/accountant/reports/cash-flow', icon: ArrowRightLeft, label: 'Cash Flow' },
        ],
      },
    ],
  },
  { to: '/orgs', icon: Building2, label: 'Orgs' },
]

const adminNavItems = [
  { to: '/admin', icon: Wrench, label: 'Admin' },
]

const superAdminNavItems = [
  { to: '/users', icon: Users, label: 'Users' },
]

function filterNavItem(item, isLoggedIn, features, role, accountantTier) {
  if (item.auth && !isLoggedIn) return null
  if (item.featureFlag && !features?.[item.featureFlag]) return null
  // F226: adminOnly entries (e.g. Localization tooling) are hidden from
  // regular users. Visible to admin + super_admin roles only.
  if (item.adminOnly && role !== 'admin' && role !== 'super_admin') return null
  // Accountant tier gating — locked items are fully absent, never greyed.
  if (item.minTier && TIER_RANK[item.minTier] > TIER_RANK[accountantTier ?? 'easy']) return null
  if (item.submenu) {
    const filteredSub = item.submenu.filter(sub => !sub.auth || isLoggedIn)
    return { ...item, submenu: filteredSub.length > 0 ? filteredSub : undefined }
  }
  return item
}

function filterNav(items, isLoggedIn, features, role, accountantTier) {
  return items
    .map(item => {
      if (item.items) {
        const filtered = item.items
          .map(child => filterNavItem(child, isLoggedIn, features, role, accountantTier))
          .filter(Boolean)
        return filtered.length > 0 ? { ...item, items: filtered } : null
      }
      return filterNavItem(item, isLoggedIn, features, role, accountantTier)
    })
    .filter(Boolean)
}

export function getNavItems(role, isLoggedIn, features, accountantTier) {
  if (!isLoggedIn) return filterNav([...publicNavItems], false, features, role, accountantTier)
  const items = filterNav([...authNavItems], true, features, role, accountantTier)
  if (role === 'admin' || role === 'super_admin') {
    items.push(...adminNavItems)
  }
  if (role === 'super_admin') {
    items.push(...superAdminNavItems)
  }
  return items
}

function renderNavItem(item, location, expandedMenu, setExpandedMenu, onNavClick) {
  const { to, icon: Icon, label, submenu } = item
  const hasSubmenu = submenu && submenu.length > 0
  const isParentActive = hasSubmenu
    ? submenu.some(s => location.pathname === s.to || location.pathname.startsWith(s.to + '/'))
    : location.pathname.startsWith(to)

  if (hasSubmenu) {
    return (
      <div key={to} role="listitem">
        <NavLink
          to={submenu[0].to}
          end
          onClick={onNavClick}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-all duration-150 ${
            isParentActive
              ? 'bg-sc-accent/10 text-sc-accent border-l-2 border-l-sc-accent border-r border-t border-b border-sc-accent/20'
              : 'text-gray-400 hover:text-gray-300 hover:bg-white/5 hover:translate-x-0.5 border border-transparent'
          }`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
          <span className="font-display tracking-wide text-xs uppercase flex-1 text-left">{label}</span>
        </NavLink>

        {isParentActive && (
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
                <span className="font-display tracking-wide uppercase flex-1">{sub.label}</span>
                {sub.badge === 'sorting' && <SortingNavBadge />}
                {sub.badge === 'loans' && <LoansNavBadge />}
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
      {item.badge === 'sorting' && <SortingNavBadge />}
      {item.badge === 'loans' && <LoansNavBadge />}
    </NavLink>
  )
}

function SidebarContent({ expandedMenu, setExpandedMenu, onNavClick }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user
  const userRole = session?.user?.role || 'user'

  const { data: status } = useStatus()
  const { data: prefs } = usePreferences({ skip: !isLoggedIn })
  const navItems = getNavItems(userRole, isLoggedIn, status?.features, prefs?.accountantTier)

  // Auto-expand the group containing the current route on initial load.
  // Includes implicit routes that aren't sidebar items but belong to a group.
  const IMPLICIT_GROUP_ROUTES = {
    '/loadout': 'My Fleet',
    '/analysis': 'My Fleet',
  }
  const hasAutoExpanded = React.useRef(false)
  useEffect(() => {
    if (hasAutoExpanded.current) return
    // Check implicit routes first (pages not in sidebar but belonging to a group)
    for (const [prefix, group] of Object.entries(IMPLICIT_GROUP_ROUTES)) {
      if (location.pathname.startsWith(prefix)) {
        setExpandedMenu(group)
        hasAutoExpanded.current = true
        return
      }
    }
    for (const item of navItems) {
      if (!item.group) continue
      const active = item.items.some(child =>
        child.submenu
          ? child.submenu.some(s => location.pathname === s.to || location.pathname.startsWith(s.to + '/'))
          : location.pathname === child.to || location.pathname.startsWith(child.to + '/')
      )
      if (active) {
        setExpandedMenu(item.group)
        hasAutoExpanded.current = true
        return
      }
    }
  }, [navItems, location.pathname, setExpandedMenu])

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
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
      <div className="flex flex-col gap-0.5 p-2 flex-1 overflow-y-auto" role="list">
        {navItems.map((item) => {
          // Group with collapsible children
          if (item.group) {
            const GroupIcon = item.icon
            const groupKey = item.group
            const isGroupExpanded = expandedMenu === groupKey
            const isGroupActive = item.items.some(child =>
              child.submenu
                ? child.submenu.some(s => location.pathname === s.to || location.pathname.startsWith(s.to + '/'))
                : location.pathname === child.to || location.pathname.startsWith(child.to + '/')
            )

            return (
              <div key={groupKey} role="listitem">
                <button
                  onClick={() => setExpandedMenu(isGroupExpanded ? null : groupKey)}
                  aria-expanded={isGroupExpanded}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-all duration-150 ${
                    isGroupActive && !isGroupExpanded
                      ? 'text-sc-accent'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <GroupIcon className="w-4 h-4" aria-hidden="true" />
                  <span className="font-display tracking-wide text-[10px] uppercase flex-1 text-left">{groupKey}</span>
                  {isGroupExpanded ? (
                    <ChevronDown className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="w-3 h-3" aria-hidden="true" />
                  )}
                </button>

                {isGroupExpanded && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-sc-border pl-2" role="list">
                    {item.items.map((child) => renderNavItem(child, location, expandedMenu, setExpandedMenu, onNavClick))}
                  </div>
                )}
              </div>
            )
          }

          // Top-level item (Dashboard, Settings, Orgs)
          return renderNavItem(item, location, expandedMenu, setExpandedMenu, onNavClick)
        })}
      </div>

      {/* Privacy mode removed from sidebar — managed in Settings */}

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
        </div>
      )}

      <div className="p-3 border-t border-sc-border">
        <p className="text-[11px] font-mono text-gray-500 text-center tracking-widest">
          v1.0.0 · <NavLink to="/about" className="hover:text-sc-accent transition-colors">About</NavLink>
        </p>
        <p className="text-[10px] text-gray-600 text-center mt-1">
          <NavLink to="/privacy" className="hover:text-gray-400 transition-colors">Privacy</NavLink>
          {' · '}
          <NavLink to="/terms" className="hover:text-gray-400 transition-colors">Terms</NavLink>
        </p>
        <a
          href="https://ko-fi.com/scbridge"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 mt-2 px-2 py-1 rounded border border-sc-border text-[10px] text-gray-500 hover:text-sc-accent hover:border-sc-accent/30 transition-colors"
        >
          <Heart className="w-3 h-3 fill-current" />
          Support
        </a>
        <a
          href="https://robertsspaceindustries.com/en/community/fan-kit-usage-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-2"
        >
          <img
            src="/made-by-community.png"
            alt="Made by the Community"
            className="w-8 mx-auto opacity-50 hover:opacity-80 transition-opacity"
            style={{ filter: 'invert(1) brightness(2)' }}
          />
        </a>
      </div>
    </>
  )
}

function CollapsedSidebar({ onExpand }) {
  const location = useLocation()
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user
  const userRole = session?.user?.role || 'user'
  const { data: status } = useStatus()
  const { data: prefs } = usePreferences({ skip: !isLoggedIn })
  const navItems = getNavItems(userRole, isLoggedIn, status?.features, prefs?.accountantTier)

  return (
    <>
      <div className="p-3 border-b border-sc-border flex justify-center">
        <img src="/logo.png" alt="SC Bridge" className="w-6 h-6" />
      </div>
      <div className="flex flex-col gap-1 p-1.5 flex-1" role="list">
        {navItems.map((item) => {
          // Group — show group icon, active if any child active
          if (item.group) {
            const GroupIcon = item.icon
            const isActive = item.items.some(child =>
              child.submenu
                ? child.submenu.some(s => location.pathname === s.to || location.pathname.startsWith(s.to + '/'))
                : location.pathname === child.to || location.pathname.startsWith(child.to + '/')
            )
            const firstTo = item.items[0]?.submenu ? item.items[0].submenu[0].to : item.items[0]?.to
            return (
              <NavLink
                key={item.group}
                to={firstTo}
                role="listitem"
                title={item.group}
                className={`flex items-center justify-center p-2 rounded transition-all duration-150 ${
                  isActive
                    ? 'bg-sc-accent/10 text-sc-accent border border-sc-accent/20'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
                }`}
              >
                <GroupIcon className="w-4 h-4" aria-hidden="true" />
              </NavLink>
            )
          }

          const { to, icon: Icon, label, submenu } = item
          const isActive = submenu
            ? location.pathname.startsWith(to)
            : to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={submenu ? submenu[0].to : to}
              end={to === '/'}
              role="listitem"
              title={label}
              className={`flex items-center justify-center p-2 rounded transition-all duration-150 ${
                isActive
                  ? 'bg-sc-accent/10 text-sc-accent border border-sc-accent/20'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
            </NavLink>
          )
        })}
      </div>
      <div className="p-1.5 border-t border-sc-border flex justify-center">
        <button
          onClick={onExpand}
          className="p-2 rounded text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </>
  )
}

function RequireRole({ roles, children }) {
  const { data: session } = useSession()
  if (!session?.user?.role || !roles.includes(session.user.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return children
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
  const [expandedMenu, setExpandedMenu] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === '1' } catch { return false }
  })

  const { data: session } = useSession()
  const isLoggedIn = !!session?.user
  const { data: sidebarPrefs, loading: sidebarPrefsLoading } = usePreferences({ skip: !isLoggedIn })
  const sidebarSynced = useRef(false)

  // Sync sidebar state from API — API wins over localStorage for logged-in users.
  useEffect(() => {
    if (sidebarPrefsLoading || !isLoggedIn || sidebarPrefs === null || sidebarSynced.current) return
    sidebarSynced.current = true

    const apiVal = sidebarPrefs?.sidebarCollapsed
    if (apiVal !== undefined) {
      setSidebarCollapsed(apiVal === '1')
      try { localStorage.setItem('sidebar-collapsed', apiVal) } catch {}
    } else if (sidebarPrefs) {
      // No API value yet — migrate localStorage to DB if non-default (collapsed)
      const local = (() => { try { return localStorage.getItem('sidebar-collapsed') } catch { return null } })()
      if (local === '1') {
        setPreferences({ sidebarCollapsed: '1' }).catch(() => {})
      }
    }
  }, [sidebarPrefs, sidebarPrefsLoading, isLoggedIn])

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('sidebar-collapsed', next ? '1' : '0') } catch {}
      if (isLoggedIn) setPreferences({ sidebarCollapsed: next ? '1' : '0' }).catch(() => {})
      return next
    })
  }

  return (
    <TimezoneProvider>
    <PrivacyModeProvider>
    <Routes>
      {/* Public auth routes — no sidebar */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/2fa" element={<Suspense fallback={<LoadingState fullScreen />}><TwoFactorVerify /></Suspense>} />
      <Route path="/verify-email" element={<Suspense fallback={<LoadingState fullScreen />}><VerifyEmail /></Suspense>} />
      <Route path="/privacy" element={<Suspense fallback={<LoadingState fullScreen />}><Privacy /></Suspense>} />
      <Route path="/terms" element={<Suspense fallback={<LoadingState fullScreen />}><Terms /></Suspense>} />
      <Route path="/code-signing" element={<Suspense fallback={<LoadingState fullScreen />}><CodeSigning /></Suspense>} />
      <Route path="/accept-invitation" element={<Suspense fallback={<LoadingState fullScreen />}><AcceptInvitation /></Suspense>} />
      <Route path="/u/:handle/fleet" element={<Suspense fallback={<LoadingState fullScreen />}><PublicFleet /></Suspense>} />

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
            <nav className={`hidden md:flex ${sidebarCollapsed ? 'w-14' : 'w-56'} bg-sc-darker/80 border-r border-sc-border flex-col shrink-0 sticky top-0 h-screen transition-all duration-200`} aria-label="Main">
              {sidebarCollapsed ? (
                <CollapsedSidebar onExpand={toggleSidebar} />
              ) : (
                <>
                  <SidebarContent
                    expandedMenu={expandedMenu}
                    setExpandedMenu={setExpandedMenu}
                    onNavClick={() => {}}
                  />
                  <button
                    onClick={toggleSidebar}
                    className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-sc-panel border border-sc-border text-gray-500 hover:text-white hover:border-sc-accent transition-colors flex items-center justify-center z-10"
                    title="Collapse sidebar"
                    aria-label="Collapse sidebar"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
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
              <div className={location.pathname === '/fps-loadout' ? 'p-4' : location.pathname.startsWith('/components') ? 'px-3 py-6 pt-16 md:pt-6' : 'max-w-7xl mx-auto p-6 md:p-6 pt-16 md:pt-6'}>
                <ErrorBoundary>
                  <Suspense fallback={<LoadingState fullScreen />}>
                    <Routes>
                      {/* Public routes */}
                      <Route path="/" element={<Dashboard />} />

                      {/* Public game data routes */}
                      <Route path="/ships" element={<ShipDB />} />
                      <Route path="/ships/:slug" element={<ShipDetail />} />
                      <Route path="/paints" element={<PaintBrowser />} />
                      <Route path="/paints/:slug" element={<PaintDetail />} />
                      <Route path="/loot" element={<LootDB />} />
                      <Route path="/loot/sets/:setSlug" element={<ArmorSetDetail />} />
                      <Route path="/loot/:uuid/detail" element={<FullItemDetail />} />
                      <Route path="/loot/:uuid" element={<LootDB />} />
                      <Route path="/poi" element={<POI />} />
                      <Route path="/poi/at/:parentSlug" element={<POIChildren />} />
                      <Route path="/poi/:slug" element={<POIDetail />} />
                      <Route path="/poi/:type/:slug" element={<POIDetail />} />
                      <Route path="/missions" element={<Missions />} />
                      <Route path="/contracts" element={<Navigate to="/missions" replace />} />
                      <Route path="/shops" element={<Shops />} />
                      <Route path="/trade" element={<TradeCommodities />} />
                      <Route path="/mining" element={<Mining />} />
                      <Route path="/mining/element/:id" element={<MiningElementDetail />} />
                      <Route path="/mining/location/:id" element={<MiningLocationDetail />} />
                      <Route path="/mining/:type/:id" element={<MiningEquipmentDetail />} />
                      <Route path="/crafting" element={<Suspense fallback={<LoadingState fullScreen />}><Crafting /></Suspense>} />
                      <Route path="/crafting/sim" element={<Suspense fallback={<LoadingState fullScreen />}><QualitySimPage /></Suspense>} />
                      <Route path="/crafting/saved" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><SavedBlueprints /></Suspense></RequireAuth>} />
                      <Route path="/missions/faction/:slug" element={<Suspense fallback={<LoadingState fullScreen />}><FactionDetail /></Suspense>} />
                      <Route path="/missions/:key" element={<Suspense fallback={<LoadingState fullScreen />}><MissionDetail /></Suspense>} />
                      <Route path="/crafting/:id" element={<Suspense fallback={<LoadingState fullScreen />}><BlueprintDetail /></Suspense>} />
                      <Route path="/careers" element={<Careers />} />
                      <Route path="/law" element={<LawSystem />} />
                      <Route path="/npc-loadouts" element={<NPCLoadouts />} />
                      <Route path="/components" element={<Navigate to="/components/weapons" replace />} />
                      <Route path="/components/:type" element={<Suspense fallback={<LoadingState fullScreen />}><Components /></Suspense>} />
                      <Route path="/about" element={<Suspense fallback={<LoadingState fullScreen />}><About /></Suspense>} />
                      <Route path="/loadout/:slug" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><Loadout /></Suspense></RequireAuth>} />
                      <Route path="/fps-loadout" element={<RequireAuth><RequireFeature flag="fpsLoadout"><Suspense fallback={<LoadingState fullScreen />}><FpsLoadout /></Suspense></RequireFeature></RequireAuth>} />
                      <Route path="/fleet" element={<RequireAuth><FleetTable /></RequireAuth>} />
                      <Route path="/hangar" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><Hangar /></Suspense></RequireAuth>} />
                      <Route path="/insurance" element={<RequireAuth><Insurance /></RequireAuth>} />
                      <Route path="/insights" element={<RequireAuth><Insights /></RequireAuth>} />
                      <Route path="/analysis" element={<RequireAuth><Analysis /></RequireAuth>} />
                      <Route path="/analysis/history" element={<RequireAuth><AnalysisHistory /></RequireAuth>} />
                      <Route path="/sync-import" element={<RequireAuth><Import /></RequireAuth>} />
                      <Route path="/localization" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><LocalizationBuilder /></Suspense></RequireAuth>} />
                      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
                      <Route path="/accountant" element={<Navigate to="/accountant/settings" replace />} />
                      <Route path="/accountant/settings" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><AccountantSettings /></Suspense></RequireAuth>} />
                      <Route path="/accountant/ledger" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><AccountantLedger /></Suspense></RequireAuth>} />
                      <Route path="/accountant/sorting" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><AccountantSorting /></Suspense></RequireAuth>} />
                      <Route path="/accountant/loans" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><AccountantLoans /></Suspense></RequireAuth>} />
                      <Route path="/accountant/loans/:id" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><AccountantLoanDetail /></Suspense></RequireAuth>} />
                      <Route path="/accountant/tactical" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><AccountantTactical /></Suspense></RequireAuth>} />
                      <Route path="/accountant/reports" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><AccountantReports /></Suspense></RequireAuth>} />
                      <Route path="/accountant/reports/pl" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><AccountantReportPL /></Suspense></RequireAuth>} />
                      <Route path="/accountant/reports/balance" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><AccountantReportBalance /></Suspense></RequireAuth>} />
                      <Route path="/accountant/reports/net-worth" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><AccountantReportNetWorth /></Suspense></RequireAuth>} />
                      <Route path="/accountant/reports/cash-flow" element={<RequireAuth><Suspense fallback={<LoadingState fullScreen />}><AccountantReportCashFlow /></Suspense></RequireAuth>} />
                      <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
                      <Route path="/admin/*" element={<RequireAuth><RequireRole roles={["admin", "super_admin"]}><Admin /></RequireRole></RequireAuth>} />
                      <Route path="/users" element={<RequireAuth><RequireRole roles={["admin", "super_admin"]}><UserManagement /></RequireRole></RequireAuth>} />
                      <Route path="/orgs" element={<RequireAuth><Orgs /></RequireAuth>} />
                      <Route path="/orgs/:slug" element={<RequireAuth><OrgProfile /></RequireAuth>} />
                      <Route path="/orgs/:slug/settings" element={<RequireAuth><OrgSettings /></RequireAuth>} />
                      <Route path="/orgs/:slug/ops/:opId" element={<RequireAuth><RequireFeature flag="ops"><OpDetail /></RequireFeature></RequireAuth>} />
                      <Route path="/join/:code" element={<RequireFeature flag="ops"><JoinOp /></RequireFeature>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </ErrorBoundary>
              </div>
            </main>
          </div>
        }
      />
    </Routes>
    </PrivacyModeProvider>
    </TimezoneProvider>
  )
}

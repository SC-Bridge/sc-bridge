import React from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import AdminOverview from './Overview'
import AdminVersions from './Versions'
import AdminData from './Data'
import AdminSync from './Sync'
import AdminCache from './Cache'
import AdminUsers from './Users'
import AdminPacks from './Packs'

const SUB_NAV = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/versions', label: 'Versions' },
  { to: '/admin/data', label: 'Data' },
  { to: '/admin/sync', label: 'Sync' },
  { to: '/admin/cache', label: 'Cache' },
  { to: '/admin/packs', label: 'Packs' },
  { to: '/admin/users', label: 'Users' },
]

export default function Admin() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="ADMIN"
        subtitle="Sync management and system controls"
      />

      {/* Horizontal sub-nav pills */}
      <nav className="flex items-center gap-1 flex-wrap" aria-label="Admin sections">
        {SUB_NAV.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-xs font-display tracking-wider uppercase transition-colors ${
                isActive
                  ? 'bg-sc-accent/20 text-sc-accent'
                  : 'text-gray-500 hover:text-gray-200'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route index element={<AdminOverview />} />
        <Route path="versions" element={<AdminVersions />} />
        <Route path="data" element={<AdminData />} />
        <Route path="sync" element={<AdminSync />} />
        <Route path="cache" element={<AdminCache />} />
        <Route path="packs" element={<AdminPacks />} />
        <Route path="users" element={<AdminUsers />} />
      </Routes>
    </div>
  )
}

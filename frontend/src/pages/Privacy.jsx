import React from 'react'
import { Link } from 'react-router-dom'
import { Rocket } from 'lucide-react'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-sc-darker py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <Rocket className="w-6 h-6 text-sc-accent" />
            <span className="font-display font-bold text-lg tracking-wider text-sc-accent">SC BRIDGE</span>
          </Link>
          <h1 className="font-display font-bold text-2xl text-white tracking-wider">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mt-2 font-mono">Last updated: February 2026</p>
        </div>

        <div className="panel p-8 space-y-8 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">1. What We Collect</h2>
            <p className="mb-3">SC Bridge collects only what's needed to provide the service:</p>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li><strong className="text-gray-300">Account data</strong> — email, display name, and password hash (for email/password accounts)</li>
              <li><strong className="text-gray-300">OAuth profile data</strong> — name, email, avatar URL, provider IDs, and tokens from social login providers (Google, GitHub, Discord, Twitch)</li>
              <li><strong className="text-gray-300">Session data</strong> — IP address, user-agent, and session tokens (7-day expiry)</li>
              <li><strong className="text-gray-300">Fleet data</strong> — imported from HangarXplor browser extension: pledge IDs, costs, dates, insurance types, and custom ship names</li>
              <li><strong className="text-gray-300">LLM API keys</strong> — your own API keys for AI analysis features, encrypted with AES-256-GCM at rest</li>
              <li><strong className="text-gray-300">AI analysis text</strong> — fleet analysis reports generated using your API keys</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">2. How We Use Your Data</h2>
            <p className="text-gray-400">
              Your data is used solely to provide and improve the SC Bridge service. We do not sell, rent, or share your personal data for advertising or marketing purposes. We do not build advertising profiles or track you across other services.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">3. Third Parties</h2>
            <p className="mb-3 text-gray-400">SC Bridge integrates with the following third-party services:</p>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li><strong className="text-gray-300">OAuth providers</strong> (Google, GitHub, Discord, Twitch) — authentication only; we receive your basic profile info</li>
              <li><strong className="text-gray-300">AI providers</strong> (OpenAI, Anthropic, Google, etc.) — sanitized fleet data is sent via your own API key for analysis; we do not send your personal information</li>
              <li><strong className="text-gray-300">Cloudflare</strong> — hosting, CDN, and DNS; subject to Cloudflare's privacy policy</li>
              <li><strong className="text-gray-300">Grafana Cloud &amp; New Relic</strong> — observability and application logs</li>
              <li><strong className="text-gray-300">Resend</strong> — transactional email delivery (account verification, data exports)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">4. Data Retention</h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li><strong className="text-gray-300">Sessions</strong> — automatically expire after 7 days</li>
              <li><strong className="text-gray-300">Fleet data</strong> — retained until you re-import (replaces all) or delete your account</li>
              <li><strong className="text-gray-300">AI analyses</strong> — retained until you delete them or delete your account</li>
              <li><strong className="text-gray-300">Application logs</strong> — subject to Cloudflare, Grafana Cloud, and New Relic retention policies</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">5. Your Rights (GDPR)</h2>
            <p className="mb-3 text-gray-400">You have the following rights regarding your data:</p>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li><strong className="text-gray-300">Right of access</strong> — download or email a complete export of your data from your Account page</li>
              <li><strong className="text-gray-300">Right to rectification</strong> — edit your profile information from your Account page</li>
              <li><strong className="text-gray-300">Right to erasure</strong> — permanently delete your account and all associated data from your Account page</li>
              <li><strong className="text-gray-300">Right to data portability</strong> — export your data as structured JSON</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">6. Cookies</h2>
            <p className="text-gray-400">
              SC Bridge uses only essential authentication session cookies. We do not use tracking cookies, analytics cookies, or advertising cookies. No cookie consent banner is required because we only use strictly necessary cookies.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">7. Contact</h2>
            <p className="text-gray-400">
              For privacy-related questions or data requests, contact us at{' '}
              <a href="mailto:ops@scbridge.app" className="text-sc-accent hover:text-sc-accent/80 transition-colors">
                ops@scbridge.app
              </a>.
            </p>
          </section>

          <section className="pt-4 border-t border-sc-border">
            <p className="text-xs text-gray-500">
              Star Citizen is a registered trademark of Cloud Imperium Games Corporation. SC Bridge is not affiliated with, endorsed, or sponsored by Cloud Imperium Games.
            </p>
          </section>
        </div>

        <div className="mt-6 text-center">
          <Link to="/terms" className="text-sm text-sc-accent hover:text-sc-accent/80 transition-colors">
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  )
}

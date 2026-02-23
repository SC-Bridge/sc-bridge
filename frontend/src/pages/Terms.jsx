import React from 'react'
import { Link } from 'react-router-dom'
import { Rocket } from 'lucide-react'

export default function Terms() {
  return (
    <div className="min-h-screen bg-sc-darker py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <Rocket className="w-6 h-6 text-sc-accent" />
            <span className="font-display font-bold text-lg tracking-wider text-sc-accent">SC BRIDGE</span>
          </Link>
          <h1 className="font-display font-bold text-2xl text-white tracking-wider">Terms of Service</h1>
          <p className="text-sm text-gray-500 mt-2 font-mono">Last updated: February 2026</p>
        </div>

        <div className="panel p-8 space-y-8 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">1. Acceptance</h2>
            <p className="text-gray-400">
              By accessing or using SC Bridge ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">2. What the Service Is</h2>
            <p className="text-gray-400">
              SC Bridge is a Star Citizen fleet management tool that helps you track ships, insurance, pledge data, and fleet composition. It is a hobby project and is not affiliated with, endorsed, or sponsored by Cloud Imperium Games Corporation.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">3. Accounts</h2>
            <p className="text-gray-400">
              You may create one account per person. You are responsible for maintaining the security of your account credentials. Do not share your login details with others.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">4. Acceptable Use</h2>
            <p className="mb-3 text-gray-400">You agree not to:</p>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li>Abuse, disrupt, or overload the Service</li>
              <li>Scrape, crawl, or use automated tools to access the Service</li>
              <li>Attempt to access other users' data or accounts</li>
              <li>Use the Service for any unlawful purpose</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">5. AI Features</h2>
            <p className="text-gray-400">
              SC Bridge offers optional AI-powered fleet analysis. These features use your own API keys to connect to third-party AI providers (OpenAI, Anthropic, Google, etc.). Only sanitized fleet data (ship names, roles, quantities) is sent for analysis — no personal information. You are responsible for the costs associated with your own API key usage.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">6. Service Availability</h2>
            <p className="text-gray-400">
              SC Bridge is a hobby project maintained by one person. There is no service level agreement (SLA). The Service may experience downtime, bugs, or data loss. We will make reasonable efforts to keep it running, but make no guarantees of availability.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">7. Termination</h2>
            <p className="text-gray-400">
              We may suspend or terminate accounts that violate these terms. You may delete your account at any time from the Account page, which permanently removes all your data.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">8. Disclaimer</h2>
            <p className="text-gray-400">
              The Service is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">9. Limitation of Liability</h2>
            <p className="text-gray-400">
              SC Bridge is a free hobby application. To the maximum extent permitted by law, the operator shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or data arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white mb-3 uppercase tracking-wider">10. Contact</h2>
            <p className="text-gray-400">
              For questions about these terms, contact us at{' '}
              <a href="mailto:support@scbridge.app" className="text-sc-accent hover:text-sc-accent/80 transition-colors">
                support@scbridge.app
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
          <Link to="/privacy" className="text-sm text-sc-accent hover:text-sc-accent/80 transition-colors">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  )
}

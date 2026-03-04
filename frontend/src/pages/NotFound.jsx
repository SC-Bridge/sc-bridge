import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import PageHeader from '../components/PageHeader'

export default function NotFound() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader title="PAGE NOT FOUND" />
      <div className="panel p-12 text-center space-y-4">
        <Compass className="w-16 h-16 text-gray-600 mx-auto" />
        <h2 className="text-xl font-medium text-gray-300">Lost in the verse</h2>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/" className="btn-primary inline-block mt-4">
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}

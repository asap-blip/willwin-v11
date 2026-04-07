import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SettingsView } from '@/components/settings/SettingsView'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b px-6 py-4" style={{ backgroundColor: 'var(--rs-primary-subtle)', borderColor: 'var(--rs-primary-border)' }}>
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link href="/">
            <Button variant="outline" size="icon-sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        <SettingsView />
      </div>
    </div>
  )
}

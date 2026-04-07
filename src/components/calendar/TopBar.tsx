'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateHeading } from '@/lib/calendar-helpers'

interface TopBarProps {
  currentDate: string // YYYY-MM-DD
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onNewBooking: () => void
}

export function TopBar({ currentDate, onPrev, onNext, onToday, onNewBooking }: TopBarProps) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <div
      className="flex items-center justify-between px-6 py-3 border-b"
      style={{ backgroundColor: 'var(--rs-primary-subtle)', borderColor: 'var(--rs-primary-border)' }}
    >
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={onPrev}
          className="border-[var(--rs-primary-light)] text-[var(--rs-text-primary)] hover:bg-[var(--rs-primary-subtle)]"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onNext}
          className="border-[var(--rs-primary-light)] text-[var(--rs-text-primary)] hover:bg-[var(--rs-primary-subtle)]"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onToday}
          className="border-[var(--rs-primary-light)] text-[var(--rs-text-primary)] hover:bg-[var(--rs-primary-subtle)]"
        >
          Today
        </Button>
        <h1 className="text-lg font-semibold ml-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--rs-text-primary)' }}>
          {formatDateHeading(currentDate)}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <Link href="/clients" className="text-sm hover:underline" style={{ color: 'var(--rs-text-primary)' }}>
          Clients
        </Link>
        <Link href="/settings" className="text-sm hover:underline" style={{ color: 'var(--rs-text-primary)' }}>
          Settings
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm hover:underline"
          style={{ color: 'var(--rs-neutral)' }}
        >
          Logout
        </button>
        <Button
          className="gap-2 text-white hover:opacity-90"
          style={{ backgroundColor: 'var(--rs-primary)' }}
          onClick={onNewBooking}
        >
          <Plus className="h-4 w-4" />
          New Booking
        </Button>
      </div>
    </div>
  )
}

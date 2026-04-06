'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

interface SelectedClient {
  id: string
  first_name: string
  last_name: string
}

interface ClientSearchProps {
  selectedClient: SelectedClient | null
  onSelect: (client: SelectedClient) => void
}

interface CustomerRow {
  id: string
  first_name: string
  last_name: string
  phone: string | null
}

export function ClientSearch({ selectedClient, onSelect }: ClientSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerRow[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  // Inline create fields
  const [newFirst, setNewFirst] = useState('')
  const [newLast, setNewLast] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [creating, setCreating] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = useCallback(async (term: string) => {
    if (term.length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { data } = await supabase
      .from('customers')
      .select('id, first_name, last_name, phone')
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%`)
      .limit(10)
    setResults(data ?? [])
    setSearching(false)
  }, [])

  function handleInputChange(value: string) {
    setQuery(value)
    setShowResults(true)
    setShowCreate(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 300)
  }

  function handleSelect(client: CustomerRow) {
    onSelect({ id: client.id, first_name: client.first_name, last_name: client.last_name })
    setQuery('')
    setShowResults(false)
    setShowCreate(false)
  }

  function handleClear() {
    onSelect(null as unknown as SelectedClient) // parent handles null via customerId state
    setQuery('')
  }

  async function handleCreateClient() {
    if (!newFirst.trim() || !newLast.trim()) return
    setCreating(true)
    // TODO: include tenant_id when tenant_id column exists
    const { data, error } = await supabase
      .from('customers')
      .insert({ first_name: newFirst.trim(), last_name: newLast.trim(), phone: newPhone.trim() || null })
      .select('id, first_name, last_name')
      .single()
    setCreating(false)
    if (error || !data) return

    // Auto-select the new client — no re-search
    onSelect({ id: data.id, first_name: data.first_name, last_name: data.last_name })
    setQuery('')
    setShowResults(false)
    setShowCreate(false)
    setNewFirst('')
    setNewLast('')
    setNewPhone('')
  }

  // If a client is already selected, show it as a chip
  if (selectedClient) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-md bg-muted/30">
        <span className="text-sm flex-1">
          {selectedClient.first_name} {selectedClient.last_name}
        </span>
        <button type="button" onClick={handleClear} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => query.length >= 2 && setShowResults(true)}
          placeholder="Search by name or phone..."
          className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Dropdown */}
      {showResults && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {searching && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
          )}

          {!searching && query.length >= 2 && results.length === 0 && !showCreate && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No clients found</div>
          )}

          {!searching && results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSelect(c)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between"
            >
              <span>{c.first_name} {c.last_name}</span>
              {c.phone && <span className="text-muted-foreground text-xs">{c.phone}</span>}
            </button>
          ))}

          {/* Add new client toggle */}
          {!showCreate && query.length >= 2 && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted/50 flex items-center gap-1.5 border-t border-border"
            >
              <Plus className="h-3.5 w-3.5" />
              Add new client
            </button>
          )}

          {/* Inline create form */}
          {showCreate && (
            <div className="p-3 border-t border-border space-y-2">
              <input
                type="text"
                value={newFirst}
                onChange={(e) => setNewFirst(e.target.value)}
                placeholder="First name *"
                className="w-full px-3 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                value={newLast}
                onChange={(e) => setNewLast(e.target.value)}
                placeholder="Last name *"
                className="w-full px-3 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Phone"
                className="w-full px-3 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleCreateClient}
                  disabled={creating || !newFirst.trim() || !newLast.trim()}
                >
                  {creating ? 'Saving...' : 'Save Client'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

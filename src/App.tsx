import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { HexEmbed } from './components/HexEmbed'
import { FindingsWrite } from './components/FindingsWrite'

export default function App() {
  const [findings, setFindings] = useState<{ id: string; content: string; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadFindings() {
      const { data, error: e } = await supabase
        .from('findings')
        .select('id, content, created_at')
        .order('created_at', { ascending: false })
      if (e) {
        setError(e.message)
        setFindings([])
      } else {
        setFindings(data ?? [])
      }
      setLoading(false)
    }
    loadFindings()
  }, [])

  const onSaved = (content: string) => {
    setFindings((prev) => [
      { id: crypto.randomUUID(), content, created_at: new Date().toISOString() },
      ...prev,
    ])
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <h1 className="text-xl font-semibold">GTMX Commercialization — Findings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Data from Hex (Snowflake, Sheets, Chorus). Write findings to Supabase.
        </p>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 p-6">
        <section>
          <h2 className="mb-3 text-lg font-medium text-slate-700">Hex: Calls, Connects, Demos &amp; feedback</h2>
          <HexEmbed />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-slate-700">Write findings (saved to Supabase)</h2>
          <FindingsWrite onSaved={onSaved} />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-slate-700">Recent findings</h2>
          {loading && <p className="text-slate-500">Loading…</p>}
          {error && <p className="text-red-600">{error}</p>}
          {!loading && !error && findings.length === 0 && (
            <p className="text-slate-500">No findings yet. Add one above.</p>
          )}
          {!loading && findings.length > 0 && (
            <ul className="space-y-2">
              {findings.map((f) => (
                <li key={f.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm text-slate-600">{new Date(f.created_at).toLocaleString()}</p>
                  <p className="mt-1 whitespace-pre-wrap">{f.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

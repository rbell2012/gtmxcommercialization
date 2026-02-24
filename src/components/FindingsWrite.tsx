import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = { onSaved: (content: string) => void }

export function FindingsWrite({ onSaved }: Props) {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!content.trim()) return
    setError(null)
    setSaving(true)
    const { error: err } = await supabase.from('findings').insert({ content: content.trim() })
    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    onSaved(content.trim())
    setContent('')
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Add a finding or note…"
        className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        rows={4}
        disabled={saving}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving || !content.trim()}
        className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save to Supabase'}
      </button>
    </form>
  )
}

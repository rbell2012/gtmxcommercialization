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
        className="w-full rounded-lg border border-input bg-background p-3 text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        rows={4}
        disabled={saving}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={saving || !content.trim()}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save to Supabase'}
      </button>
    </form>
  )
}

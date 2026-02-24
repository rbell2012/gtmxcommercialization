import { useState, useEffect } from 'react'

const HEX_EMBED_API = import.meta.env.VITE_HEX_EMBED_URL_API

export function HexEmbed() {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!HEX_EMBED_API)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!HEX_EMBED_API) {
      setLoading(false)
      setError('Hex embed not configured. Set VITE_HEX_EMBED_URL_API to your Edge Function URL that returns a signed Hex embed URL.')
      return
    }
    let cancelled = false
    fetch(HEX_EMBED_API)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.url) setEmbedUrl(data.url)
        else if (!cancelled) setError(data?.error ?? 'No embed URL returned')
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? 'Failed to load Hex embed URL')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="flex h-96 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-500">Loading Hex…</div>
  if (error) return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">{error}</div>
  if (!embedUrl) return null

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <iframe
        title="Hex project: findings data"
        src={embedUrl}
        className="h-[600px] w-full border-0"
        allowFullScreen
      />
    </div>
  )
}

# Hex embed URL Edge Function

Creates a single-use signed URL for embedding your Hex project (Hex CreatePresignedUrl API).

## Supabase setup

1. **Create the function in Supabase Dashboard**
   - Edge Functions → New function → name: `hex-embed-url`
   - Paste the contents of `index.ts` (or deploy via CLI).

2. **Set secrets** (Project Settings → Edge Functions → Secrets, or CLI):
   - `HEX_API_TOKEN` — Hex personal or workspace API token ([Hex API](https://learn.hex.tech/docs/api/api-overview))
   - `HEX_PROJECT_ID` — Your Hex project UUID (from the Hex project URL or Variables sidebar in Logic View)

3. **In your app** set `VITE_HEX_EMBED_URL_API` to:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/hex-embed-url`

## Copy-paste version (for Supabase Dashboard)

Create a new Edge Function named `hex-embed-url` and paste this as the body:

```ts
// Supabase Edge Function: hex-embed-url
// Creates a single-use signed URL for embedding a Hex project (CreatePresignedUrl).
// Set secrets in Supabase: HEX_API_TOKEN, HEX_PROJECT_ID

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const HEX_API_BASE = 'https://app.hex.tech/api/v1'

interface HexPresignedResponse {
  url?: string
  traceId?: string
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors() })
  }

  const token = Deno.env.get('HEX_API_TOKEN')
  const projectId = Deno.env.get('HEX_PROJECT_ID')

  if (!token || !projectId) {
    return new Response(
      JSON.stringify({ error: 'HEX_API_TOKEN and HEX_PROJECT_ID must be set in Supabase secrets' }),
      { status: 500, headers: { ...cors(), 'Content-Type': 'application/json' } }
    )
  }

  try {
    const res = await fetch(`${HEX_API_BASE}/embedding/createPresignedUrl/${projectId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope: ['EXPORT_CSV', 'EXPORT_PDF'],
        expiresIn: 15000,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return new Response(
        JSON.stringify({ error: `Hex API error: ${res.status} ${text}` }),
        { status: res.status, headers: { ...cors(), 'Content-Type': 'application/json' } }
      )
    }

    const data = (await res.json()) as HexPresignedResponse
    if (!data?.url) {
      return new Response(
        JSON.stringify({ error: 'No URL in Hex response' }),
        { status: 502, headers: { ...cors(), 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ url: data.url }), {
      headers: { ...cors(), 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...cors(), 'Content-Type': 'application/json' } }
    )
  }
})

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}
```

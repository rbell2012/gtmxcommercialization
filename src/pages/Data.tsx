import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { HexEmbed } from "@/components/HexEmbed";
import { FindingsWrite } from "@/components/FindingsWrite";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Data() {
  const [findings, setFindings] = useState<{ id: string; content: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFindings() {
      const { data, error: e } = await supabase
        .from("findings")
        .select("id, content, created_at")
        .order("created_at", { ascending: false });
      if (e) {
        setError(e.message);
        setFindings([]);
      } else {
        setFindings(data ?? []);
      }
      setLoading(false);
    }
    loadFindings();
  }, []);

  const onSaved = (content: string) => {
    setFindings((prev) => [
      { id: crypto.randomUUID(), content, created_at: new Date().toISOString() },
      ...prev,
    ]);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">GTMX Commercialization</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Data from Hex (Snowflake, Sheets, Chorus). Write findings to Supabase.
          </p>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="font-display text-foreground">Hex: Calls, Connects, Demos &amp; feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <HexEmbed />
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="font-display text-foreground">Write findings (saved to Supabase)</CardTitle>
          </CardHeader>
          <CardContent>
            <FindingsWrite onSaved={onSaved} />
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="font-display text-foreground">Recent findings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && <p className="text-muted-foreground">Loading…</p>}
            {error && <p className="text-destructive">{error}</p>}
            {!loading && !error && findings.length === 0 && (
              <p className="text-muted-foreground">No findings yet. Add one above.</p>
            )}
            {!loading && findings.length > 0 && (
              <ul className="space-y-2">
                {findings.map((f) => (
                  <li key={f.id} className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">{new Date(f.created_at).toLocaleString()}</p>
                    <p className="mt-1 whitespace-pre-wrap text-foreground">{f.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

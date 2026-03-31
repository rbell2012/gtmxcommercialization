import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 450;

function normalizeThree(values: string[] | undefined): [string, string, string] {
  const v = values ?? [];
  return [v[0] ?? "", v[1] ?? "", v[2] ?? ""];
}

export interface DebouncedTeamStringListFieldProps {
  values: string[];
  onCommit: (next: string[]) => void;
  placeholders: [string, string, string];
  inputClassName?: string;
}

/**
 * Three text inputs that update immediately in local state; commits to parent
 * (and thus DB via updateTeam) debounced, with flush on blur and unmount.
 * Parent should set `key={teamId + '-objections'}` (or similar) when switching teams.
 */
function DebouncedTeamStringListFieldInner({
  values,
  onCommit,
  placeholders,
  inputClassName = "bg-secondary/20 border-border text-foreground text-sm h-9",
}: DebouncedTeamStringListFieldProps) {
  const [draft, setDraft] = useState(() => normalizeThree(values));
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Avoid depending on `values` reference (parent often passes a fresh [] each render). */
  const valuesKey = JSON.stringify(normalizeThree(values));
  useEffect(() => {
    setDraft(normalizeThree(values));
  }, [valuesKey]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = [...draftRef.current];
    onCommitRef.current(next);
  }, []);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onCommitRef.current([...draftRef.current]);
    }, DEBOUNCE_MS);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        onCommitRef.current([...draftRef.current]);
      }
    },
    [],
  );

  const onChangeAt = (index: number, value: string) => {
    setDraft((prev) => {
      const next = [...prev] as [string, string, string];
      next[index] = value;
      return next;
    });
    schedule();
  };

  const onBlurField = () => {
    flush();
  };

  return (
    <ol className="list-decimal pl-5 space-y-2">
      {draft.map((v, i) => (
        <li key={i}>
          <Input
            value={v}
            onChange={(e) => onChangeAt(i, e.target.value)}
            onBlur={onBlurField}
            placeholder={placeholders[i]}
            className={inputClassName}
          />
        </li>
      ))}
    </ol>
  );
}

export const DebouncedTeamStringListField = memo(DebouncedTeamStringListFieldInner);

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type PasswordModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlock: (password: string) => boolean;
};

export function PasswordModal({ open, onOpenChange, onUnlock }: PasswordModalProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setError(null);
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setPassword("");
          setError(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unlock Protected Pages</DialogTitle>
          <DialogDescription>Enter the password to access Data, Quota, and Roadmap.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Password"
            autoFocus
          />
          {error ? (
            <div className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              const ok = onUnlock(password);
              if (ok) {
                onOpenChange(false);
              } else {
                setError("Incorrect password.");
              }
            }}
          >
            Unlock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


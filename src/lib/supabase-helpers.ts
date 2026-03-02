import { toast } from "sonner";

export async function dbMutate(
  query: PromiseLike<{ error: { message: string } | null }>,
  label?: string,
) {
  const { error } = await query;
  if (error) {
    console.error(`[db] ${label ?? "mutation"} failed:`, error.message);
    toast.error(`Save failed: ${label ?? error.message}`);
  }
}

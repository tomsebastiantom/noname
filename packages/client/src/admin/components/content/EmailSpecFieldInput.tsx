import type { Spec } from "@json-render/core";
import { JSONUIProvider, Renderer } from "@json-render/react-email";
import { Label } from "../../../components/ui/label";

const PREVIEW_STATE = {
  name: "Preview User",
  storeName: "Demo Store",
  taskName: "Sample task",
  summary: "Sample summary.",
};

function parseSpecJson(raw: string): Spec | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.root !== "string" || typeof record.elements !== "object") return null;
    return parsed as Spec;
  } catch {
    return null;
  }
}

export function EmailSpecFieldInput({
  field,
  value,
  onChange,
}: {
  field: { key: string; label: string; required: boolean };
  value: string;
  onChange: (value: string) => void;
}) {
  const spec = parseSpecJson(value);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={field.key}>
          {field.label}
          {field.required ? " *" : ""}
        </Label>
        <textarea
          id={field.key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          required={field.required}
          spellCheck={false}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          json-render email spec. Dynamic copy uses $state paths (e.g. /name) filled at send time.
        </p>
      </div>

      {spec ? (
        <div className="rounded-md border border-input bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Preview (sample state)</p>
          <div className="overflow-auto rounded border bg-white p-2 text-sm">
            <JSONUIProvider initialState={PREVIEW_STATE}>
              <Renderer spec={spec} loading={false} />
            </JSONUIProvider>
          </div>
        </div>
      ) : value.trim() ? (
        <p className="text-xs text-destructive">
          Invalid spec JSON — fix syntax or root/elements shape.
        </p>
      ) : null}
    </div>
  );
}

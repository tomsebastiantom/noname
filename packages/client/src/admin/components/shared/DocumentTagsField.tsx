import { useEffect, useState } from "react";
import { fetchScopeTags } from "../../../auth/document-scope";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

export type DocumentTagsFieldLabels = {
  tagsLabel: string;
  tagsPlaceholder: string;
  tagsHint: string;
};

export function DocumentTagsField({
  id,
  value,
  onChange,
  labels,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  labels: DocumentTagsFieldLabels;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchScopeTags()
      .then((tags) => {
        if (!cancelled) setSuggestions(tags.map((tag) => tag.slug));
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const listId = `${id}-tag-suggestions`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{labels.tagsLabel}</Label>
      <Input
        id={id}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={labels.tagsPlaceholder}
      />
      <datalist id={listId}>
        {suggestions.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      <p className="text-xs text-muted-foreground">{labels.tagsHint}</p>
    </div>
  );
}

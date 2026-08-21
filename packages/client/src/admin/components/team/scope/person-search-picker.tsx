import { useMemo } from "react";
import type { TeamUser } from "../../../../auth/team-users";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { cn } from "../../../../lib/utils";

export function PersonSearchPicker({
  id,
  label,
  placeholder,
  emptyMessage,
  noneSelectedLabel,
  selectedLabel,
  clearSelectionLabel,
  disabled,
  users,
  selectedUserIds,
  query,
  onQueryChange,
  onToggleUser,
  onClearSelection,
}: {
  id: string;
  label: string;
  placeholder: string;
  emptyMessage: string;
  noneSelectedLabel: string;
  selectedLabel: string;
  clearSelectionLabel: string;
  disabled: boolean;
  users: TeamUser[];
  selectedUserIds: string[];
  query: string;
  onQueryChange: (value: string) => void;
  onToggleUser: (userId: string) => void;
  onClearSelection: () => void;
}) {
  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const selectedCount = selectedUserIds.length;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <div
        className={cn(
          "flex min-h-9 items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm",
          selectedCount > 0 ? "border-primary/40 bg-primary/5" : "border-input bg-muted/30",
        )}
      >
        {selectedCount > 0 ? (
          <>
            <Badge variant="default" className="w-fit shrink-0">
              {selectedCount} {selectedLabel}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-7 shrink-0 px-2"
              disabled={disabled}
              onClick={onClearSelection}
            >
              {clearSelectionLabel}
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground">{noneSelectedLabel}</span>
        )}
      </div>
      <div
        className="max-h-48 overflow-y-auto rounded-md border border-input bg-background"
        aria-label={label}
        role="listbox"
        aria-multiselectable="true"
      >
        {users.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          users.map((user) => {
            const selected = selectedSet.has(user.userId);
            return (
              <button
                key={user.userId}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/80",
                  selected && "bg-primary/10 font-medium ring-1 ring-inset ring-primary/30",
                )}
                onClick={() => onToggleUser(user.userId)}
              >
                <span className="min-w-0 truncate">{formatPersonOption(user)}</span>
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-transparent",
                  )}
                  aria-hidden
                >
                  ✓
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatPersonOption(user: TeamUser): string {
  const name = user.displayName.trim();
  if (name && name.toLowerCase() !== user.email.toLowerCase()) {
    return `${name} (${user.email})`;
  }
  return user.email;
}

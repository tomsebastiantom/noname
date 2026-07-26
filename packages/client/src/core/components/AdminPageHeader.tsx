export function AdminPageHeader({
  title,
  description,
}: {
  title: string;
  description?: string | null;
}) {
  return (
    <header className="border-b px-8 py-5">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </header>
  );
}

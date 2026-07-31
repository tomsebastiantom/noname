import { useEffect, useRef } from "react";
import type Player from "rrweb-player";

type RrwebEvent = Record<string, unknown>;

/** Mount rrweb-player for a merged session event list. */
export function ReplayPlayer({ events }: { events: RrwebEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (!target || events.length === 0) return;

    let cancelled = false;

    void (async () => {
      const [{ default: rrwebPlayer }, _css] = await Promise.all([
        import("rrweb-player"),
        import("rrweb-player/dist/style.css"),
      ]);
      if (cancelled || !containerRef.current) return;

      target.replaceChildren();

      playerRef.current = new rrwebPlayer({
        target,
        props: {
          events: events as never,
          width: Math.min(1024, target.clientWidth || 1024),
          height: 576,
          autoPlay: false,
          showController: true,
        },
      });
    })();

    return () => {
      cancelled = true;
      target.replaceChildren();
      playerRef.current = null;
    };
  }, [events]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-md border bg-muted/20 [&_.rr-player]:mx-auto"
    />
  );
}

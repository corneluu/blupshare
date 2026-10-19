export type Friend = { id: string; face: string; color: string; name: string; status: string; activity: string | null; disabled: boolean }

export default function FriendsRow({ items, label, onPick }: { items: Friend[]; label: string; onPick: (id: string) => void }) {
  return (
    <ul aria-label={label} className="pointer-events-auto -mx-3 flex w-[calc(100%+1.5rem)] snap-x gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
      {items.map((f) => (
        <li key={f.id} className="snap-start">
          <button
            disabled={f.disabled}
            onClick={() => onPick(f.id)}
            className="flex min-h-[4.5rem] w-20 flex-col items-center gap-0.5 rounded-2xl bg-[var(--surface)] px-1 py-1.5 shadow-md transition enabled:active:scale-95 disabled:opacity-50 disabled:grayscale"
          >
            <span className="relative">
              <span
                className="grid size-10 place-items-center rounded-full border-[3px] bg-[var(--surface)] text-xl font-extrabold"
                style={{ borderColor: f.color }}
              >
                {f.face}
              </span>
              {f.activity && (
                <span className="absolute -right-1.5 -bottom-1 grid size-5 place-items-center rounded-full bg-[var(--surface)] text-[11px] shadow">{f.activity}</span>
              )}
            </span>
            <span className="w-full truncate text-xs font-bold">{f.name}</span>
            <span className="w-full truncate text-[10px] text-[var(--muted)]">{f.status}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

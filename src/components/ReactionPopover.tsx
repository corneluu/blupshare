import { REACTIONS } from '../lib/types'

// Rendered into a map marker through a portal (see MapView)
export default function ReactionPopover({ name, onPick }: { name: string; onPick: (emoji: string) => void }) {
  return (
    <div className="blup-pop-in w-48 rounded-3xl bg-[var(--surface)] p-2 text-center shadow-xl">
      <p className="truncate px-2 pb-1 text-sm font-bold">{name}</p>
      <div className="grid grid-cols-4 gap-1">
        {REACTIONS.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e)}
            aria-label={e}
            className="grid size-11 place-items-center rounded-2xl text-2xl transition hover:bg-[var(--accent-soft)] active:scale-90"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

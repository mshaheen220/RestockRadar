export const SLOT_LABEL: Record<number, string> = {
  1: 'First choice',
  2: 'Backup #1',
  3: 'Backup #2',
  4: 'Backup #3',
  5: 'Backup #4',
};

/** Shared by Preferred Products (WatchlistManager) and Deal Finder so a ranked choice always
 * looks the same wherever it appears — the numbered badge is what tells "first choice" apart
 * from "backup" at a glance, replacing the word "Alternate" this app deliberately doesn't use. */
export default function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      aria-hidden="true"
      title={SLOT_LABEL[rank]}
      className={
        'shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ' +
        (rank === 1
          ? 'bg-brand-500 text-white'
          : 'border border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400')
      }
    >
      {rank}
    </span>
  );
}

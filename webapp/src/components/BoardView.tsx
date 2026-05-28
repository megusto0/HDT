import type { BoardMinion } from '../types';
import { MinionChip } from './MinionCard';

export default function BoardView({ minions, slots = 7 }: { minions: BoardMinion[]; slots?: number }) {
  const visible = minions.slice(0, slots);
  return (
    <div className={`board-strip ${visible.length ? '' : 'is-empty'}`}>
      {visible.map((minion, index) => (
        <MinionChip key={`${minion.cardId}-${index}`} minion={minion} />
      ))}
    </div>
  );
}

export default function PlacementBadge({ value, large = false }: { value: number | null; large?: boolean }) {
  if (!value) return <span className={`place-badge empty ${large ? 'large' : ''}`}>—</span>;
  const tier = value === 1 ? 'first' : value <= 4 ? 'top4' : 'loss';
  return (
    <span className={`place-badge ${tier} ${large ? 'large' : ''}`}>
      <span>{value}</span>
      {large ? <small>{value === 1 ? 'VICTORY' : value <= 4 ? 'TOP 4' : 'DEFEAT'}</small> : null}
    </span>
  );
}


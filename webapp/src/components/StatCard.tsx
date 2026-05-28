export default function StatCard({
  label,
  value,
  unit,
  sub
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub: React.ReactNode;
}) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>
        {value}
        {unit ? <small>{unit}</small> : null}
      </strong>
      <p>{sub}</p>
    </article>
  );
}


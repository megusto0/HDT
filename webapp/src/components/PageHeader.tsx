export default function PageHeader({
  kicker,
  title,
  accent,
  strap,
  meta
}: {
  kicker: string;
  title: string;
  accent?: string;
  strap: string;
  meta?: React.ReactNode;
}) {
  return (
    <section className="page-header">
      <div>
        <span className="kicker">{kicker}</span>
        <h1>
          {title}
          {accent ? <em> {accent}</em> : null}
        </h1>
        <p>{strap}</p>
      </div>
      {meta ? <div className="page-meta">{meta}</div> : null}
    </section>
  );
}


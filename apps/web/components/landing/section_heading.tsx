export function SectionHeading({
  id,
  children,
  icon,
  action,
}: {
  id?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2
        id={id}
        className="font-hand painted-label flex scroll-mt-24 items-center gap-2 text-[clamp(1.5rem,2.6vw,2rem)] leading-none"
      >
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}

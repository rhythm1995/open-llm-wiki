export function BrandMark({
  size = 56,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}olw-mark.png`}
      alt="Open LLM Wiki"
      width={size}
      height={size}
      className={className}
    />
  );
}

export function BrandLockup({
  size = 48,
  wordClass = "font-display text-[22px] tracking-[-0.02em] text-bistre",
}: {
  size?: number;
  wordClass?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={size} />
      <span className={wordClass}>Open LLM Wiki</span>
    </div>
  );
}

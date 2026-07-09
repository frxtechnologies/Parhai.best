import { Link } from "wouter";

type BrandLogoProps = {
  className?: string;
  href?: string;
  imageClassName?: string;
  linked?: boolean;
  /** Wraps the logo in a white rounded pill — use on dark/coloured backgrounds
   *  so the navy+teal colours stay visible without a brightness filter. */
  dark?: boolean;
};

export function BrandLogo({
  className = "",
  href = "/",
  imageClassName = "h-10 w-auto",
  linked = true,
  dark = false,
}: BrandLogoProps) {
  const img = (
    <img src="/logo.png" alt="Parhai.com" className={`object-contain ${imageClassName}`} />
  );

  const inner = dark ? (
    <div className={`inline-flex items-center ${className}`}>
      <div className="inline-flex items-center rounded-xl bg-white px-3 py-2 shadow-md shadow-black/25">
        {img}
      </div>
    </div>
  ) : (
    <div className={`inline-flex items-center ${className}`}>
      {img}
    </div>
  );

  if (!linked) return inner;
  return <Link href={href} className="inline-flex items-center">{inner}</Link>;
}

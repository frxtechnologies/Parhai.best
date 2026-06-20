import { Link } from "wouter";

type BrandLogoProps = {
  className?: string;
  href?: string;
  imageClassName?: string;
  linked?: boolean;
};

export function BrandLogo({ className = "", href = "/", imageClassName = "h-10 w-auto", linked = true }: BrandLogoProps) {
  const logo = (
    <div className={`inline-flex items-center ${className}`}>
      <img src="/logo.png" alt="Parhai.com" className={`object-contain ${imageClassName}`} />
    </div>
  );

  if (!linked) return logo;

  return (
    <Link href={href} className="inline-flex items-center">
      {logo}
    </Link>
  );
}

/**
 * A pool team's logo: the uploaded image if there is one, otherwise a
 * generated monogram (first letter of the team name on a colour derived
 * from the name). Works in both server and client components (no hooks).
 */
export function TeamLogo({
  logo,
  name,
  size = 24,
}: {
  logo: string | null | undefined;
  name: string;
  size?: number;
}) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        className="flex-shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span
      aria-hidden="true"
      className="inline-flex flex-shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.45, backgroundColor: `hsl(${hue} 55% 42%)` }}
    >
      {letter}
    </span>
  );
}

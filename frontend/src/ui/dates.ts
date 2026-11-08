const pad = (n: number) => String(n).padStart(2, "0");
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => toIso(new Date());
/** The coming Sunday (today if it is Sunday). */
export const nextSunday = (from = new Date()) => {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return toIso(d);
};
export const frenchLong = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

import { useEffect, useState } from "react";

export type Route = { path: string; params: URLSearchParams };
const read = (): Route => {
  const h = window.location.hash.replace(/^#/, "") || "/";
  const [path, q = ""] = h.split("?");
  return { path, params: new URLSearchParams(q) };
};
export const useRoute = (): Route => {
  const [r, setR] = useState<Route>(read);
  useEffect(() => {
    const on = () => setR(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
};
export const href = (path: string, params: Record<string, string> = {}) => {
  const q = new URLSearchParams(params).toString();
  return `#${path}${q ? `?${q}` : ""}`;
};
export const go = (path: string, params: Record<string, string> = {}) => { window.location.hash = href(path, params).slice(1); };

import { useCallback, useEffect, useState } from "react";
import type { Me, Section } from "../domain/types";
import type { ProgramGateway } from "./ProgramGateway";

export function useSession(gateway: ProgramGateway) {
  const [me, setMe] = useState<Me>({
  email: null,
  editor: false,
  admin: false,
});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    gateway.me().then(setMe).catch(() => undefined).finally(() => setReady(true));
  }, [gateway]);
  const login = useCallback(async (email: string, password: string) => {
    const s = await gateway.login(email, password);
    setMe({
  email: s.email,
  editor: s.editor,
  admin: s.admin,
});
  }, [gateway]);
  const logout = useCallback(() => { gateway.logout(); setMe({
  email: null,
  editor: false,
  admin: false,
});; }, [gateway]);
  return { me, ready, login, logout };
}

export function useSections(gateway: ProgramGateway): Section[] {
  const [sections, setSections] = useState<Section[]>([]);
  useEffect(() => { gateway.listSections().then(setSections).catch(() => undefined); }, [gateway]);
  return sections;
}

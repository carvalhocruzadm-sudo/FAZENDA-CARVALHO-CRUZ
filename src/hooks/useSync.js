import { useEffect, useState } from "react";

import { estadoSync, observarSync } from "../lib/sync";

export function useSync() {
  const [estado, setEstado] = useState(estadoSync);
  useEffect(() => observarSync(setEstado), []);
  return estado;
}

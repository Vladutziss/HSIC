// Proof files. An artifact asset id resolves to a /_blob/ URL; a Supabase
// storage path (it contains "/") needs a temporary signed URL.

import React, { useEffect, useState } from "react";
import { assetUrl } from "../lib/store.js";
import { signedUrl } from "../lib/supabase.js";

const isPath = (id) => typeof id === "string" && id.includes("/");

export function useAssetUrl(id) {
  const [url, setUrl] = useState(() => (id && !isPath(id) ? assetUrl(id) : null));
  useEffect(() => {
    let alive = true;
    if (!id) setUrl(null);
    else if (!isPath(id)) setUrl(assetUrl(id));
    else signedUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

/** The small stored thumbnail when there is one, otherwise the full file. */
export function AssetImage({ id, thumb, alt = "", ...rest }) {
  const url = useAssetUrl(thumb ? null : id);
  const src = thumb || url;
  return src ? <img src={src} alt={alt} {...rest} /> : null;
}

export function AssetAudio({ id, ...rest }) {
  const url = useAssetUrl(id);
  return url ? <audio controls src={url} {...rest} /> : null;
}

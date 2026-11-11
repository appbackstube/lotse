import { useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { FileText } from "lucide-react";

export function TaskAssetThumbnail({ taskId, assetId }: { taskId: string; assetId: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    setSource(null);
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void invoke<string>("task_asset_image_path", { taskId, assetId }).then((path) => {
        if (active) setSource(convertFileSrc(path));
      }).catch(() => { /* The original remains available through the preview button. */ });
    }, { rootMargin: "128px" });
    if (host.current) observer.observe(host.current);
    return () => { active = false; observer.disconnect(); };
  }, [taskId, assetId]);
  return <span ref={host} className="flex h-full w-full items-center justify-center">{source
    ? <img src={source} alt="" loading="lazy" decoding="async" />
    : <FileText size={28} />}</span>;
}

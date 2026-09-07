import { useState } from "react";
import { Images } from "lucide-react";
import type { WorkflowTurnItem } from "@shared/workflow-read-thread-contract";
import { WorkflowActivityRow } from "./ActivityRow";
import {
  WorkflowImageLightbox,
  type WorkflowImagePreview,
} from "./ImageLightbox";
import { workflowImageSource } from "./image-source";
import styles from "./ImageViewGroup.module.css";

type ImageItem = Extract<WorkflowTurnItem, { type: "imageView" }>;

/** Images inspected by tools belong to the trace, not the final result stack. */
export function WorkflowImageViewGroup({ items }: { items: ImageItem[] }) {
  // Codex resets these nested disclosures when the enclosing trace unmounts.
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<WorkflowImagePreview | null>(null);
  const images = items.map((item) => ({
    src: workflowImageSource(item.path),
    name: item.path.split(/[\\/]/).pop() || item.path,
  }));
  return (
    <div className={styles.group}>
      <WorkflowActivityRow
        activityKind="imageView"
        icon={<Images />}
        label={`已查看 ${items.length} 张图像`}
        open={open}
        onToggle={() => setOpen(!open)}
        detail={
          <div className={styles.images} role="group" aria-label="已检查的图像">
            {images.map((image, index) => (
              <button
                type="button"
                className={styles.image}
                key={items[index].id}
                aria-label={`打开已检查图像：${image.name}`}
                onClick={() => setPreview(image)}
              >
                <img src={image.src} alt={image.name} />
              </button>
            ))}
          </div>
        }
      />
      <WorkflowImageLightbox
        image={preview}
        images={images}
        onNavigate={setPreview}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

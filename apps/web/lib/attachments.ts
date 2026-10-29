import { z } from "zod";
import type { ImageAttachment } from "./project-types";

export const AttachmentsSchema = z.array(z.object({
  name: z.string().min(1).max(180),
  dataUrl: z.string().max(1_500_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/)
}).strict()).max(3).default([]);

export function modelImages(attachments: ImageAttachment[]) {
  return attachments.map(({ dataUrl }) => {
    const [, mediaType, data] = /^data:(image\/(?:png|jpeg|webp));base64,(.*)$/.exec(dataUrl)!;
    return { mediaType: mediaType as "image/png" | "image/jpeg" | "image/webp", data };
  });
}

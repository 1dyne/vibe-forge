import { z } from "zod";

export const ChipSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
  cat: z.enum(["형태", "반응", "감지", "누구"]),
  label: z.string().min(1).max(40),
  say: z.string().min(1).max(80),
  pre: z.boolean().optional(),
  tail: z.boolean().optional(),
  replaces: z.string().max(32).nullable().optional(),
  tags: z.array(z.string().max(20)).max(6),
  react: z.enum(["light", "sound", "move", "none"]).optional()
}).strict();

export const IdeaSchema = z.string().trim().min(2).max(300);

// HANDOFF §8 이벤트 이름
export const EVENT_NAMES = ["screen_view", "idea_submit", "dice", "chip_pick", "fire_locked", "share_open", "share_done", "waitlist_join", "invite_copy", "referral_join", "fire_out", "name_set", "forge_created", "forge_open", "forge_shared", "object_open", "mail_sent", "mail_done_seen", "notice_seen", "visibility_set", "visitor_onboard_start", "fuel_given", "want_given", "note_left", "neighbor_added", "dex_added", "visit", "street_open", "hall_open", "plan_vote", "report_sent", "decor_saved", "world_from_result", "world_enter", "world_house_enter", "gate_find", "village_open_enter", "world_sound", "lantern_hung", "lantern_done", "lantern_removed", "lantern_make", "lantern_unmake", "rope_open", "forge_sheet", "memo_added", "memo_exported", "memo_downloaded"] as const;

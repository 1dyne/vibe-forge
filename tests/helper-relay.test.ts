import { beforeEach, describe, expect, it } from "vitest";
import { RelayError, claimJob, enqueueJob, helperStatus, pushJobEvent, readJobEvents, resetHelperRelay, touchHelper } from "../apps/web/lib/helper-relay";

const job = (userId = "u1") => enqueueJob({ userId, projectId: "p1", channel: "main", text: "안녕" });

describe("달그락 도우미 우체통", () => {
  beforeEach(() => resetHelperRelay());

  it("도우미가 꺼져 있으면 말을 받지 않는다", () => {
    expect(helperStatus("u1").online).toBe(false);
    expect(() => job()).toThrowError(RelayError);
  });

  it("켜져 있다는 신호는 45초 동안만 유효하다", () => {
    touchHelper("u1", { model: "m" });
    expect(helperStatus("u1")).toMatchObject({ online: true, model: "m" });
    expect(helperStatus("u1", Date.now() + 46_000).online).toBe(false);
  });

  it("기다리던 도우미가 새 말을 바로 받는다", async () => {
    touchHelper("u1");
    const waiting = claimJob("u1", 2000);
    const sent = job();
    expect((await waiting)?.id).toBe(sent.id);
    expect(await claimJob("u1", 0)).toBeNull();
  });

  it("답이 조금씩 흘러가고, 끝나면 더 받지 않는다", async () => {
    touchHelper("u1");
    const sent = job();
    await claimJob("u1", 0);
    const reading = readJobEvents(sent.id, "u1", 0, 2000);
    pushJobEvent(sent.id, "u1", { type: "delta", text: "안" });
    expect(await reading).toMatchObject({ events: [{ type: "delta", text: "안" }], next: 1, finished: false });
    pushJobEvent(sent.id, "u1", { type: "done", text: "안녕하세요" });
    pushJobEvent(sent.id, "u1", { type: "delta", text: "뒤늦은 조각" });
    expect(await readJobEvents(sent.id, "u1", 1, 0)).toMatchObject({ events: [{ type: "done", text: "안녕하세요" }], next: 2, finished: true });
  });

  it("남의 대화는 읽지도 쓰지도 못한다", async () => {
    touchHelper("u1"); touchHelper("u2");
    const sent = job("u1");
    expect(await claimJob("u2", 0)).toBeNull();
    expect(() => pushJobEvent(sent.id, "u2", { type: "done", text: "가로채기" })).toThrowError(RelayError);
    await expect(readJobEvents(sent.id, "u2", 0, 0)).rejects.toBeInstanceOf(RelayError);
  });

  it("답이 밀려 있으면 더 쌓지 않는다", () => {
    touchHelper("u1");
    job(); job(); job();
    expect(() => job()).toThrowError(/답하는 중/);
  });
});

describe("photos on a job", () => {
  it("carries at most three photos to the app and drops them when the turn ends", async () => {
    const relay = await import("../apps/web/lib/helper-relay");
    relay.resetHelperRelay();
    relay.touchHelper("photo-user");
    const photo = { name: "a.jpg", dataUrl: "data:image/jpeg;base64,AAAA" };
    const job = relay.enqueueJob({ userId: "photo-user", projectId: null, channel: "main", text: "봐주세요", images: [photo, photo, photo, photo] });
    expect((await relay.claimJob("photo-user", 0))?.images).toHaveLength(3);
    relay.pushJobEvent(job.id, "photo-user", { type: "done", text: "네" });
    expect(job.images).toHaveLength(0);
  });
});

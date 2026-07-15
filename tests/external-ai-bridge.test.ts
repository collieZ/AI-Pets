import assert from "node:assert/strict";
import test from "node:test";
import { createExternalAiBridge, parseExternalPetEvent, type ExternalPetEvent } from "../apps/desktop/electron/src/externalAiBridge.ts";

test("parseExternalPetEvent normalizes a valid event", () => {
  assert.deepEqual(parseExternalPetEvent({
    type: "pet.event",
    interactionId: " aiWorking ",
    say: "正在处理任务...",
    durationMs: 3000,
    source: "codex"
  }), {
    type: "pet.event",
    interactionId: "aiWorking",
    state: undefined,
    semanticRole: undefined,
    say: "正在处理任务...",
    durationMs: 3000,
    source: "codex"
  });
});

test("parseExternalPetEvent rejects empty and oversized events", () => {
  assert.throws(() => parseExternalPetEvent({ type: "pet.event" }), /至少需要/);
  assert.throws(() => parseExternalPetEvent({ type: "pet.event", say: "x".repeat(501) }), /say/);
  assert.throws(() => parseExternalPetEvent({ type: "pet.event", state: "idle", durationMs: 10 }), /durationMs/);
});

test("HTTP bridge listens on loopback and dispatches validated events", async () => {
  const events: ExternalPetEvent[] = [];
  const bridge = createExternalAiBridge({ port: 0, dispatch: (event) => events.push(event) });
  const status = await bridge.start();
  try {
    assert.equal(status.running, true);
    assert.equal(status.host, "127.0.0.1");
    const health = await fetch(`http://127.0.0.1:${status.port}/health`);
    assert.equal(health.status, 200);
    const response = await fetch(status.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "pet.event", semanticRole: "working", source: "test" })
    });
    assert.equal(response.status, 202);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.semanticRole, "working");
  } finally {
    await bridge.stop();
  }
});

test("HTTP bridge rejects invalid content types and bodies", async () => {
  const bridge = createExternalAiBridge({ port: 0, dispatch: () => undefined, maxBodyBytes: 16 });
  const status = await bridge.start();
  try {
    const contentType = await fetch(status.endpoint, { method: "POST", body: "{}" });
    assert.equal(contentType.status, 415);
    const oversized = await fetch(status.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "pet.event", say: "too large" })
    });
    assert.equal(oversized.status, 413);
  } finally {
    await bridge.stop();
  }
});

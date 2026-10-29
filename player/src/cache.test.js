import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ DATA: "../data" }));

import { loadAlbumsCache } from "./cache";

const entry = {
  id: "/music/files/Back to Normal/Big Three.mp3",
  isNew: false,
  lastModified: "Sun, 19 Jul 2026 12:06:30 GMT",
  duration: 117.420408,
};

function serve(cache) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => cache }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadAlbumsCache", () => {
  it("keys entries by the encoded url the player uses", async () => {
    serve({ [entry.id]: entry });

    const cache = await loadAlbumsCache();

    expect(cache["/music/files/Back%20to%20Normal/Big%20Three.mp3"]).toEqual(entry);
    expect(cache[entry.id]).toBeUndefined();
  });

  it("leaves urls that need no encoding as they are", async () => {
    serve({ "/music/files/Solo/One.mp3": entry });

    const cache = await loadAlbumsCache();

    expect(cache["/music/files/Solo/One.mp3"]).toEqual(entry);
  });
});

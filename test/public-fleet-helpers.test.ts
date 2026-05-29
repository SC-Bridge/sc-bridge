import { describe, it, expect, vi } from "vitest";
import { publicFleetCacheKey, purgePublicFleetCache } from "../src/lib/publicFleet";

describe("publicFleet helpers", () => {
  it("publicFleetCacheKey lowercases + namespaces by handle", () => {
    expect(publicFleetCacheKey("JeanLuc")).toBe("public-fleet:jeanluc");
    expect(publicFleetCacheKey("JEAN_LUC")).toBe("public-fleet:jean_luc");
  });

  it("publicFleetCacheKey strips colons (cacheSlug)", () => {
    expect(publicFleetCacheKey("evil:handle")).toBe("public-fleet:evil_handle");
  });

  it("purgePublicFleetCache is a no-op when handle is null", async () => {
    const kv = { delete: vi.fn() };
    await purgePublicFleetCache(kv as unknown as KVNamespace, null);
    expect(kv.delete).not.toHaveBeenCalled();
  });

  it("purgePublicFleetCache deletes the lowercase key when handle present", async () => {
    const kv = { delete: vi.fn().mockResolvedValue(undefined) };
    await purgePublicFleetCache(kv as unknown as KVNamespace, "JeanLuc");
    expect(kv.delete).toHaveBeenCalledWith("public-fleet:jeanluc");
  });

  it("purgePublicFleetCache tolerates missing KV (local dev)", async () => {
    await expect(purgePublicFleetCache(undefined, "JeanLuc")).resolves.toBeUndefined();
  });
});

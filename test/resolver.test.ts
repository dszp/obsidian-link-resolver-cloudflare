import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

// Source of truth: the `VAULT_NAME` binding set in vitest.config.ts. Tests
// stay decoupled from whatever vault name is wired up in production.
const VAULT_NAME = env.VAULT_NAME;
const VAULT_NAME_ENC = encodeURIComponent(VAULT_NAME);

async function call(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`https://o.example.test${path}`, init), env);
}

describe("/n/<id>", () => {
  it("302s with correctly-constructed Location for a valid nanoid", async () => {
    const id = "ABCdefGHIjkl_MNO-1234";
    const res = await call(`/n/${id}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      `obsidian://advanced-uri?vault=${VAULT_NAME_ENC}&uid=${id}`,
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("400s when id is too short", async () => {
    const res = await call("/n/abc");
    expect(res.status).toBe(400);
  });

  it("400s when id is too long", async () => {
    const res = await call("/n/" + "a".repeat(22));
    expect(res.status).toBe(400);
  });

  it("400s when id contains a non-alphabet character (URL-encoded ampersand)", async () => {
    // %26 is `&` — would smuggle an extra param into the obsidian:// URI if decoded blindly.
    const res = await call("/n/abc%26def%26ghi%26jkl");
    expect(res.status).toBe(400);
  });

  it("400s when id contains a non-alphabet character (literal ampersand smuggled in)", async () => {
    const res = await call("/n/abc%26foo=bar");
    expect(res.status).toBe(400);
  });

  it("400s when id contains a URL-encoded newline", async () => {
    const res = await call("/n/abc%0Adefghijklmnopqrstuv");
    expect(res.status).toBe(400);
  });

  it("400s when id contains a forward slash (would split path)", async () => {
    const res = await call("/n/abc/def");
    expect(res.status).toBe(400);
  });

  it("302s for a lowercase UUIDv4 (Advanced URI mint format)", async () => {
    const id = "1f7ce0e6-2c63-4a91-9d2f-3e4b5c6d7e8f";
    const res = await call(`/n/${id}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      `obsidian://advanced-uri?vault=${VAULT_NAME_ENC}&uid=${id}`,
    );
  });

  it("302s for an uppercase UUIDv4", async () => {
    const id = "1F7CE0E6-2C63-4A91-AD2F-3E4B5C6D7E8F";
    const res = await call(`/n/${id}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      `obsidian://advanced-uri?vault=${VAULT_NAME_ENC}&uid=${id}`,
    );
  });

  it("400s for a UUIDv1 (wrong version nibble)", async () => {
    // version=1 — AU does not produce v1; tighter allowlist rejects it.
    const res = await call("/n/1f7ce0e6-2c63-1a91-9d2f-3e4b5c6d7e8f");
    expect(res.status).toBe(400);
  });

  it("400s for a UUID with an invalid variant nibble", async () => {
    // 13th hex digit (after the third dash) must be 8/9/a/b. `c` is invalid.
    const res = await call("/n/1f7ce0e6-2c63-4a91-cd2f-3e4b5c6d7e8f");
    expect(res.status).toBe(400);
  });

  it("400s for the NIL UUID", async () => {
    const res = await call("/n/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(400);
  });

  it("400s for a UUID-shaped string with non-hex chars", async () => {
    const res = await call("/n/zzzzzzzz-2c63-4a91-9d2f-3e4b5c6d7e8f");
    expect(res.status).toBe(400);
  });

  it("400s for a UUID with the wrong number of dashes", async () => {
    // 36 chars but dash grouping is wrong (10-4-4-4-12 instead of 8-4-4-4-12)
    const res = await call("/n/1f7ce0e612-63-4a91-9d2f-3e4b5c6d7e8f");
    expect(res.status).toBe(400);
  });

  it("400s for a UUIDv4 with a URL-encoded ampersand smuggled in (length tampering)", async () => {
    // Trying to slip `&` into what otherwise looks UUID-shaped.
    const res = await call("/n/1f7ce0e6-2c63-4a91-9d2f%263e4b5c6d7e8f");
    expect(res.status).toBe(400);
  });
});

describe("/p/?path=...", () => {
  it("302s with a correct Location for a valid relative .md path", async () => {
    const res = await call("/p/?path=Knowledge/foo.md");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      `obsidian://open?vault=${VAULT_NAME_ENC}&file=Knowledge%2Ffoo.md`,
    );
  });

  it("encodes literal `&` in the path so it cannot inject params", async () => {
    // `URLSearchParams.get` decodes percent-escapes, so `%26` (`&`) round-trips
    // into the value. encodeURIComponent in the redirect builder must then
    // re-encode it to `%26`. We verify the Location does NOT have a raw `&`
    // inside the file= value.
    const res = await call("/p/?path=" + encodeURIComponent("foo&extra=bar.md"));
    // `foo&extra=bar.md` contains `&` and `=` — both are disallowed by PATH_RE.
    // We expect 400 (fail closed), not a redirect with `%26` smuggled in.
    expect(res.status).toBe(400);
  });

  it("400s for traversal (`..`)", async () => {
    const res = await call("/p/?path=" + encodeURIComponent("../etc/passwd.md"));
    expect(res.status).toBe(400);
  });

  it("400s for traversal in a subpath segment (`a/../b.md`)", async () => {
    const res = await call("/p/?path=" + encodeURIComponent("a/../b.md"));
    expect(res.status).toBe(400);
  });

  it("400s for leading slash", async () => {
    const res = await call("/p/?path=" + encodeURIComponent("/foo.md"));
    expect(res.status).toBe(400);
  });

  it("400s for leading backslash", async () => {
    const res = await call("/p/?path=" + encodeURIComponent("\\foo.md"));
    expect(res.status).toBe(400);
  });

  it("400s for empty path", async () => {
    expect((await call("/p/?path=")).status).toBe(400);
    expect((await call("/p/")).status).toBe(400);
  });

  it("400s for a non-.md extension", async () => {
    const res = await call("/p/?path=" + encodeURIComponent("foo.txt"));
    expect(res.status).toBe(400);
  });

  it("400s for a path containing `=`", async () => {
    const res = await call("/p/?path=" + encodeURIComponent("foo=bar.md"));
    expect(res.status).toBe(400);
  });

  it("400s for a path containing a control character", async () => {
    const res = await call("/p/?path=" + encodeURIComponent("foo\nbar.md"));
    expect(res.status).toBe(400);
  });

  it("accepts a path with spaces and safe punctuation", async () => {
    const path = "Knowledge/Automation/Obsidian (test).md";
    const res = await call("/p/?path=" + encodeURIComponent(path));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      `obsidian://open?vault=${VAULT_NAME_ENC}&file=${encodeURIComponent(path)}`,
    );
  });
});

describe("/f/<name>", () => {
  it("302s for a simple bare filename", async () => {
    const res = await call("/f/Foo");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      `obsidian://open?vault=${VAULT_NAME_ENC}&file=Foo`,
    );
  });

  it("decodes URL-encoded spaces then re-encodes them in the Location", async () => {
    const res = await call("/f/" + encodeURIComponent("Foo Bar"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      `obsidian://open?vault=${VAULT_NAME_ENC}&file=Foo%20Bar`,
    );
  });

  it("400s when name contains a slash", async () => {
    const res = await call("/f/Foo/Bar");
    expect(res.status).toBe(400);
  });

  it("400s when name contains URL-encoded `&`", async () => {
    const res = await call("/f/" + encodeURIComponent("Foo&extra=bar"));
    expect(res.status).toBe(400);
  });

  it("400s when name is too long", async () => {
    const res = await call("/f/" + "a".repeat(201));
    expect(res.status).toBe(400);
  });

  it("400s for empty name", async () => {
    const res = await call("/f/");
    expect(res.status).toBe(400);
  });
});

describe("misc", () => {
  it("/ returns 200 plain text", async () => {
    const res = await call("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
  });

  it("unknown route returns 400", async () => {
    expect((await call("/x/whatever")).status).toBe(400);
    expect((await call("/random")).status).toBe(400);
  });

  it("POST is rejected with 405", async () => {
    const res = await call("/n/ABCdefGHIjkl_MNO-1234", { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD");
  });

  it("HEAD is allowed and produces same status as GET", async () => {
    const res = await call("/n/ABCdefGHIjkl_MNO-1234", { method: "HEAD" });
    expect(res.status).toBe(302);
  });

  it("no Set-Cookie on any response", async () => {
    for (const path of ["/", "/n/ABCdefGHIjkl_MNO-1234", "/p/?path=foo.md", "/f/Foo", "/badpath"]) {
      const res = await call(path);
      expect(res.headers.get("Set-Cookie")).toBeNull();
    }
  });
});

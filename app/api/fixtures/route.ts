/** GET /api/fixtures — list bundled demo documents (public/fixtures/*.md).
 *  GET /api/fixtures?name=foo.md — return one document's text for "try a sample". */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fail, ok } from "@/src/server/context";

const DIR = join(process.cwd(), "public", "fixtures");

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name");
  try {
    if (name) {
      if (name.includes("/") || name.includes("..")) return fail("Invalid name");
      const text = await readFile(join(DIR, name), "utf8");
      return ok({ name, text });
    }
    const files = (await readdir(DIR)).filter((f) => /\.(md|txt)$/.test(f)).sort();
    const samples = await Promise.all(
      files.map(async (f) => {
        const text = await readFile(join(DIR, f), "utf8");
        const title = text.match(/^#\s+(.+)$/m)?.[1] ?? f;
        const words = (text.match(/\p{L}+/gu) ?? []).length;
        return { name: f, title, words };
      }),
    );
    return ok({ samples });
  } catch {
    return ok({ samples: [] }); // fixtures not seeded yet
  }
}

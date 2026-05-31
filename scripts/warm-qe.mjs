// Pre-download the QE model weights into ./.models so the container ships
// self-contained and the first document isn't blocked on a cold download.
// Run in the Railway build (or once locally): `node scripts/warm-qe.mjs`.
import { join } from "node:path";
import { env, pipeline } from "@huggingface/transformers";

env.cacheDir = join(process.cwd(), ".models");
const model = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
console.log(`warming ${model} → .models/ …`);
const t0 = Date.now();
const extractor = await pipeline("feature-extraction", model, { dtype: "q8" });
const out = await extractor(["hello world", "hola mundo"], { pooling: "mean", normalize: true });
console.log(`ok in ${((Date.now() - t0) / 1000).toFixed(1)}s · dims ${out.tolist()[0].length}`);

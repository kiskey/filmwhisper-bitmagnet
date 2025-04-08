let kv: Deno.Kv | null = null;
let kvPromise: Promise<Deno.Kv> | null = null;

const kvFile = new URL('../cache/cache.sqlite', import.meta.url).pathname;

const cacheDir = new URL('../cache', import.meta.url).pathname;
try {
  await Deno.stat(cacheDir);
} catch (err) {
  if (err instanceof Deno.errors.NotFound) {
    await Deno.mkdir(cacheDir, { recursive: true });
    console.log("Cache directory created:", cacheDir);
  } else {
    throw err;
  }
}

/**
 * Opens and returns the Deno KV store instance.
 * Caches the instance and the promise for subsequent calls.
 */
export async function getKv(): Promise<Deno.Kv> {
  if (kv) {
    return kv;
  }
  if (kvPromise) {
    return kvPromise;
  }
  kvPromise = (async () => {
    try {
      kv = await Deno.openKv(kvFile);
      return kv;
    } catch (error) {
      console.error(`Failed to open Deno KV store:`, error);
      throw new Error(`Could not initialize KV store.`);
    }
  })();

  return kvPromise;
}

/**
 * Closes the Deno KV store instance if it's open.
 * Should be called on application shutdown.
 */
export async function closeKv(): Promise<void> {
  if (kv) {
    try {
      kv.close();
      kv = null;
      kvPromise = null;
      console.log("Deno KV store closed.");
    } catch (error) {
      console.error("Error closing KV store:", error);
    }
  }
}
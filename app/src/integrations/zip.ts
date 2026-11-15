// Read only the wanted files out of a data export, streaming, so an export of hundreds of MB
// never sits in memory whole. Uses fflate. A plain .json file is read as one entry.
// Caps: one entry over maxEntryBytes is not read, and no more than maxTotalBytes is unpacked
// from one export; both are reported in tooBig, so the import can say its weeks are partial.

import { Unzip, UnzipInflate } from "fflate";
import { CONFIG } from "../engine/config";

export interface Entries {
  /** Wanted files, decoded as UTF-8 text. */
  files: Map<string, string>;
  /** Every file name in the archive, for working out the layout. */
  names: string[];
  /** Wanted files left out because they were too big, or over the total cap. */
  tooBig: string[];
}

async function* chunks(blob: Blob): AsyncGenerator<Uint8Array> {
  const reader = blob.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    if (value) yield value;
  }
}

/** Unpack wanted entries and hand each to onEntry as soon as it is complete. The text is not
 *  kept here. */
export async function streamEntries(
  blob: Blob,
  name: string,
  want: (path: string) => boolean,
  onEntry: (path: string, text: string) => void | Promise<void>,
  caps: { maxBytes?: number; maxTotal?: number } = {},
): Promise<{ names: string[]; tooBig: string[] }> {
  const maxBytes = caps.maxBytes ?? CONFIG.integrations.maxEntryBytes;
  const maxTotal = caps.maxTotal ?? CONFIG.integrations.maxTotalBytes;
  const dec = new TextDecoder("utf-8");
  if (!/\.zip$/i.test(name)) {
    if (!want(name) && !/\.json$/i.test(name)) return { names: [name], tooBig: [] };
    if (blob.size > maxBytes || blob.size > maxTotal) return { names: [name], tooBig: [name] };
    await onEntry(name, await blob.text());
    return { names: [name], tooBig: [] };
  }
  const names: string[] = [];
  const tooBig: string[] = [];
  const pending: Promise<void>[] = [];
  let total = 0;
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (f) => {
    names.push(f.name);
    if (!want(f.name)) return;
    if ((f.originalSize ?? 0) > maxBytes || total + (f.originalSize ?? 0) > maxTotal) {
      tooBig.push(f.name);
      return;
    }
    const parts: Uint8Array[] = [];
    let size = 0;
    pending.push(
      new Promise<void>((resolve, reject) => {
        f.ondata = (err, data, final) => {
          if (err) return reject(err);
          size += data.length;
          total += data.length;
          if (size > maxBytes || total > maxTotal) {
            tooBig.push(f.name);
            f.terminate();
            return resolve();
          }
          parts.push(data);
          if (final) {
            const all = new Uint8Array(size);
            let o = 0;
            for (const p of parts) {
              all.set(p, o);
              o += p.length;
            }
            parts.length = 0;
            Promise.resolve(onEntry(f.name, dec.decode(all))).then(resolve, reject);
          }
        };
        f.start();
      }),
    );
  };
  for await (const c of chunks(blob)) unzip.push(c);
  unzip.push(new Uint8Array(0), true);
  await Promise.all(pending);
  return { names, tooBig };
}

/** Unpack wanted entries and keep them (for small files such as a profile). */
export async function readEntries(blob: Blob, name: string, want: (path: string) => boolean, maxBytes = CONFIG.integrations.maxEntryBytes): Promise<Entries> {
  const files = new Map<string, string>();
  const r = await streamEntries(blob, name, want, (p, text) => void files.set(p, text), { maxBytes });
  return { files, names: r.names, tooBig: r.tooBig };
}

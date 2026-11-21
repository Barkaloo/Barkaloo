import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const directory = new URL("../public/icons/", import.meta.url);
const source = await readFile(new URL("favicon.svg", directory));
for (const [name, size] of [
  ["favicon-16.png", 16], ["favicon-32.png", 32],
  ["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512],
]) {
  await sharp(source).resize(size, size).flatten({ background: "#101214" })
    .png().toFile(fileURLToPath(new URL(name, directory)));
}
// Full-bleed background and extra safe space for circular Android icon masks.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#101214"/><g transform="translate(6.4 6.4) scale(.8)">${source.toString().replace(/<\/?svg[^>]*>/g, "")}</g></svg>`;
await sharp(Buffer.from(maskable)).resize(512, 512).png()
  .toFile(fileURLToPath(new URL("icon-maskable-512.png", directory)));

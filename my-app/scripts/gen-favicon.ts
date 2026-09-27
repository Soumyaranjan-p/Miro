import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const root = path.join(__dirname, "..");
  const svg = fs.readFileSync(path.join(root, "src/app/icon.svg"), "utf-8");

  const sizes = [
    { size: 16, name: "favicon-16.png" },
    { size: 32, name: "favicon-32.png" },
    { size: 48, name: "favicon-48.png" },
    { size: 180, name: "apple-touch-icon.png" },
  ];

  for (const { size, name } of sizes) {
    await sharp(Buffer.from(svg), { density: 384 })
      .resize(size, size)
      .png()
      .toFile(path.join(root, "public", name));
    console.log(`public/${name}`);
  }
}

main();

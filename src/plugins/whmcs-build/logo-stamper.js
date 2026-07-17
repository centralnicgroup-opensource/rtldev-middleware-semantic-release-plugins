import { writeFile } from "node:fs/promises";
import path from "node:path";
import getError from "./get-error.js";

export default async function stampVersionOnLogo(
  logoStamp,
  version,
  { cwd = process.cwd(), logger = console } = {},
) {
  let skia;
  try {
    skia = await import("skia-canvas");
  } catch {
    throw getError("SkiaCanvasMissing");
  }

  const { Canvas, loadImage } = skia;
  const text = `v${version}`;
  const image = await loadImage(path.resolve(cwd, logoStamp.input));
  const canvas = new Canvas(image.width, image.height);
  const context = canvas.getContext("2d");

  context.drawImage(image, 0, 0);
  context.font = `${logoStamp.fontSize}px Arial`;
  context.fillStyle = logoStamp.color;

  const metrics = context.measureText(text);
  context.fillText(
    text,
    image.width - metrics.width - logoStamp.padding,
    image.height - logoStamp.padding,
  );

  await writeFile(path.resolve(cwd, logoStamp.output), await canvas.png);
  logger.log(`Stamped ${text} onto ${logoStamp.output}.`);
}

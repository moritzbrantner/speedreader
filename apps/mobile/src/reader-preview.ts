import { chunkText } from "@moritzbrantner/speed-reading/core";
import { readerFixture } from "@moritzbrantner/speed-reading/fixture";

export function mobileReaderPreview(): readonly string[] {
  return chunkText(readerFixture).map((chunk) => chunk.text);
}

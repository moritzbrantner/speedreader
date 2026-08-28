import { Pressable, Text, View } from "react-native";

import { useSpeedReader } from "@moritzbrantner/speed-reading/react";
import { readerFixture } from "@moritzbrantner/speed-reading/fixture";

export default function ReaderScreen() {
  const reader = useSpeedReader(readerFixture);
  return (
    <View accessibilityLabel="Speed reader">
      <Text>{reader.currentChunk?.text ?? "Finished"}</Text>
      <Text>{`${reader.progress.chunkIndex} / ${reader.progress.totalChunks}`}</Text>
      <Pressable accessibilityRole="button" onPress={reader.isPlaying ? reader.pause : reader.play}>
        <Text>{reader.isPlaying ? "Pause" : "Play"}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => reader.seek(reader.progress.chunkIndex + 1)}>
        <Text>Next</Text>
      </Pressable>
    </View>
  );
}

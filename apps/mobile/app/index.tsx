import { SAMPLE_READING_TEXT } from "@moritzbrantner/speed-reading";
import { useSpeedReading } from "@moritzbrantner/speed-reading/react";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ReaderScreen() {
  const [text, setText] = useState(SAMPLE_READING_TEXT);
  const [wordsPerMinute, setWordsPerMinute] = useState(360);
  const [chunkSize, setChunkSize] = useState(1);
  const reader = useSpeedReading({ text, wordsPerMinute, chunkSize });
  const chunk = reader.currentChunk;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>A0 SHARED READER</Text>
            <Text style={styles.title}>Speedreader</Text>
            <Text style={styles.description}>
              Native Expo presentation, shared chunking and playback behavior.
            </Text>
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Source text"
            style={styles.input}
          />

          <View style={styles.readerCard}>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{wordsPerMinute} WPM</Text>
              <Text style={styles.meta}>
                {reader.chunks.length === 0 ? 0 : reader.currentChunkIndex + 1} / {reader.chunks.length}
              </Text>
            </View>

            <View style={styles.readerFrame}>
              {chunk ? (
                <Text style={styles.chunk} accessibilityLabel={`Current chunk: ${chunk.text}`}>
                  <Text style={styles.prefix}>{chunk.prefix}</Text>
                  <Text style={styles.pivot}>{chunk.pivot || " "}</Text>
                  <Text>{chunk.suffix}</Text>
                </Text>
              ) : (
                <Text style={styles.description}>Enter text to start.</Text>
              )}
            </View>

            <Text style={styles.meta}>Progress {Math.round(reader.progress * 100)}%</Text>

            <View style={styles.controls}>
              <Action label="−40 WPM" onPress={() => setWordsPerMinute((value) => Math.max(120, value - 40))} />
              <Action label={reader.isPlaying ? "Pause" : "Play"} onPress={reader.toggle} primary />
              <Action label="+40 WPM" onPress={() => setWordsPerMinute((value) => Math.min(900, value + 40))} />
              <Action
                label={`${chunkSize} word${chunkSize === 1 ? "" : "s"}`}
                onPress={() => setChunkSize((value) => (value >= 4 ? 1 : value + 1))}
              />
              <Action label="Back 10" onPress={() => reader.seek(reader.currentChunkIndex - 10)} />
              <Action label="Forward 10" onPress={() => reader.seek(reader.currentChunkIndex + 10)} />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, primary && styles.primaryButton, pressed && styles.pressed]}
    >
      <Text style={[styles.buttonText, primary && styles.primaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 20 },
  container: { width: "100%", maxWidth: 760, alignSelf: "center", gap: 18 },
  heading: { gap: 6 },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 2, opacity: 0.55 },
  title: { fontSize: 38, fontWeight: "700" },
  description: { fontSize: 16, lineHeight: 24, opacity: 0.65 },
  input: { minHeight: 180, borderWidth: 1, borderColor: "#8886", borderRadius: 20, padding: 16, fontSize: 16, lineHeight: 24 },
  readerCard: { gap: 16, borderWidth: 1, borderColor: "#8886", borderRadius: 24, padding: 18 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  meta: { fontSize: 13, opacity: 0.6 },
  readerFrame: { minHeight: 220, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#8884", borderRadius: 22, padding: 16 },
  chunk: { fontSize: 40, fontWeight: "700", textAlign: "center" },
  prefix: { opacity: 0.65 },
  pivot: { color: "#dc4437" },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: { minHeight: 44, justifyContent: "center", borderWidth: 1, borderColor: "#8886", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  primaryButton: { backgroundColor: "#111" },
  buttonText: { fontWeight: "600" },
  primaryButtonText: { color: "#fff" },
  pressed: { opacity: 0.6 },
});

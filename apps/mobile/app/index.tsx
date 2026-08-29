import { createExpoDocumentImportAdapter } from "../src/expo-document-import";
import { ReaderScreen } from "../src/reader-screen";

const documentImporter = createExpoDocumentImportAdapter(
  process.env.EXPO_PUBLIC_EXTRACTION_URL,
);

export default function ReaderRoute() {
  return <ReaderScreen documentImporter={documentImporter} />;
}

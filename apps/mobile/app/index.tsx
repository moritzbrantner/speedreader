import { createExpoDocumentImportAdapter } from "../src/expo-document-import";
import { createExpoReaderPersistence } from "../src/expo-persistence";
import { ReaderScreen } from "../src/reader-screen";

const documentImporter = createExpoDocumentImportAdapter(
  process.env.EXPO_PUBLIC_EXTRACTION_URL,
);
const readerPersistence = createExpoReaderPersistence();

export default function ReaderRoute() {
  return (
    <ReaderScreen
      documentImporter={documentImporter}
      persistence={readerPersistence}
    />
  );
}

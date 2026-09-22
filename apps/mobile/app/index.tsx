import { createExpoDocumentImportAdapter } from "../src/expo-document-import";
import { createExpoReaderPersistence } from "../src/expo-persistence";
import { ReaderScreen } from "../src/reader-screen";
import { createExpoWebPageImportAdapter } from "../src/webpage-import";

const documentImporter = createExpoDocumentImportAdapter(
  process.env.EXPO_PUBLIC_EXTRACTION_URL,
);
const readerPersistence = createExpoReaderPersistence();
const webPageImporter = createExpoWebPageImportAdapter(
  process.env.EXPO_PUBLIC_WEB_READER_PREFIX,
);

export default function ReaderRoute() {
  return (
    <ReaderScreen
      documentImporter={documentImporter}
      persistence={readerPersistence}
      webPageImporter={webPageImporter}
    />
  );
}

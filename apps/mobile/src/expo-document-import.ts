import * as DocumentPicker from "expo-document-picker";
import { EncodingType, readAsStringAsync } from "expo-file-system";

import {
  createDocumentImportAdapter,
  supportedDocumentMimeTypes,
  type DocumentImportAdapter,
  type DocumentPickerResult,
} from "./document-import";
import { createHttpPdfExtractionAdapter } from "./http-pdf-extraction";

export function createExpoDocumentImportAdapter(
  extractionServiceUrl: string | undefined,
): DocumentImportAdapter {
  return createDocumentImportAdapter({
    picker: { pickDocument: pickExpoDocument },
    plainTextReader: (source) =>
      readAsStringAsync(source.uri, { encoding: EncodingType.UTF8 }),
    pdfExtraction: createHttpPdfExtractionAdapter({ serviceUrl: extractionServiceUrl }),
  });
}

async function pickExpoDocument(): Promise<DocumentPickerResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...supportedDocumentMimeTypes],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) return { status: "cancelled" };
  const asset = result.assets[0];
  if (asset === undefined) return { status: "cancelled" };

  return {
    status: "picked",
    document: {
      name: asset.name,
      uri: asset.uri,
      mimeType: asset.mimeType ?? undefined,
    },
  };
}

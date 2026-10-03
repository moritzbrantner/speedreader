import {
  extractRemoteWebPageDocument,
  type WebPageExtractionResult,
  type WebPageFetch,
} from "@speedreader/webpage-extraction";

export type WebPageImportAdapter = Readonly<{
  importWebPage: (url: string) => Promise<WebPageExtractionResult>;
}>;

export function createExpoWebPageImportAdapter(
  remoteReaderPrefix: string | undefined,
  fetchImplementation?: WebPageFetch,
): WebPageImportAdapter {
  return {
    importWebPage(url) {
      return extractRemoteWebPageDocument(url, {
        fetchImplementation,
        remoteReaderPrefix,
      });
    },
  };
}

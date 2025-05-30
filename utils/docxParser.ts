import mammoth from 'mammoth';

/**
 * Parses a DOCX file (from ArrayBuffer) and extracts its raw text content.
 * Tries to preserve paragraph breaks (often as double newlines).
 * @param arrayBuffer The ArrayBuffer content of the DOCX file.
 * @returns A Promise resolving to the extracted plain text string.
 * @throws Error if parsing fails.
 */
export async function parseDocxToText(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    // result.value contains the raw text.
    // Clean up multiple newlines which might result from paragraph conversion,
    // but preserve intentional double newlines which often signify paragraph breaks.
    // Then trim leading/trailing whitespace.
    return result.value.replace(/(\r\n|\r|\n){3,}/g, '\n\n').trim();
  } catch (error) {
    console.error("Error converting DOCX to raw text:", error);
    const mammothError = error as any;
    if (mammothError.messages) {
        console.error("Mammoth messages:", mammothError.messages);
    }
    // Re-throw the error so the caller (e.g., MediaExplorer) can handle it,
    // typically by showing a notification to the user.
    throw error; 
  }
}

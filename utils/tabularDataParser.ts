
import ExcelJS from 'exceljs';

export interface ParsedCsvData {
  headers: string[];
  rows: string[][];
}

/**
 * Parses a CSV string into an object with headers and rows.
 * Handles simple CSVs. Does not handle quotes containing delimiters or newlines.
 * Skips lines that are entirely blank or consist only of empty cells.
 * @param csvString The CSV string to parse.
 * @returns ParsedCsvData object or null if parsing fails (e.g., empty input or no valid headers).
 */
export const parseCsv = (csvString: string): ParsedCsvData | null => {
  if (!csvString || csvString.trim() === '') {
    return null;
  }

  const lines = csvString.trim().split(/\r?\n/);
  if (lines.length === 0) {
    return null;
  }

  const headers = lines[0].split(',').map(header => header.trim());
  // Check if headers are effectively empty. If all header cells are empty strings, consider it invalid.
  if (headers.length === 0 || headers.every(header => header === '')) {
      return null;
  }

  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue; // Skip empty lines

    const cells = lines[i].split(',').map(cell => cell.trim());
    // Skip row if all its cells are empty strings
    if (cells.every(cell => cell === '')) {
        continue;
    }

    // Pad rows with fewer cells than headers
    const paddedCells = [...cells];
    while (paddedCells.length < headers.length) {
      paddedCells.push('');
    }
    // Truncate rows with more cells than headers
    rows.push(paddedCells.slice(0, headers.length));
  }

  return { headers, rows };
};

/**
 * Serializes ParsedCsvData back into a CSV string.
 * @param data The ParsedCsvData object.
 * @returns A CSV formatted string.
 */
export const serializeCsv = (data: ParsedCsvData): string => {
  if (!data) return '';
  const headerString = data.headers.join(',');
  const rowStrings = data.rows.map(row => row.join(','));
  return [headerString, ...rowStrings].join('\n');
};

/**
 * Parses the first sheet of an Excel file (from ArrayBuffer) into a CSV formatted string using exceljs.
 * Filters out rows that are entirely empty.
 * @param arrayBuffer The ArrayBuffer content of the Excel file.
 * @returns A Promise resolving to a CSV string representing the first sheet, or an empty string if parsing fails or sheet is empty.
 */
export const parseExcelToCsvString = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      console.warn("Excel file contains no sheets or first sheet is not accessible.");
      return "";
    }

    const csvLines: string[] = [];
    let maxCols = 0;

    // First pass to determine max columns and collect raw row data
    const rawRowsData: (string[])[] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const rowValues: string[] = [];
      // Iterate up to actualCellCount or a reasonable max if cells are sparse
      const cellCount = row.actualCellCount;
      for (let i = 1; i <= cellCount; i++) {
        const cell = row.getCell(i);
        rowValues.push(cell.text ? cell.text.toString().trim() : '');
      }
      if (rowValues.length > maxCols) {
        maxCols = rowValues.length;
      }
      rawRowsData.push(rowValues);
    });
    
    if (rawRowsData.length === 0) return "";

    // Second pass to normalize row lengths and build CSV lines
    for (const rowData of rawRowsData) {
        const normalizedRow = [...rowData];
        while (normalizedRow.length < maxCols) {
            normalizedRow.push('');
        }
        // Filter out rows where all cells are empty
        if (!normalizedRow.every(cell => cell === '')) {
            csvLines.push(normalizedRow.join(','));
        }
    }
    
    // Further filter: remove leading/trailing empty lines from the CSV content itself
    let firstNonEmptyLine = -1;
    let lastNonEmptyLine = -1;

    for(let i=0; i < csvLines.length; i++) {
        if(csvLines[i].trim() !== '' && !csvLines[i].split(',').every(cell => cell.trim() === '')) {
            if(firstNonEmptyLine === -1) firstNonEmptyLine = i;
            lastNonEmptyLine = i;
        }
    }

    if(firstNonEmptyLine === -1) return ""; // All lines were effectively empty

    return csvLines.slice(firstNonEmptyLine, lastNonEmptyLine + 1).join('\n');

  } catch (error) {
    console.error("Error parsing Excel file to CSV string with exceljs:", error);
    return ""; 
  }
};

/**
 * Converts ParsedCsvData (headers and rows) into an ArrayBuffer representing a simple, single-sheet XLSX file using exceljs.
 * @param data The ParsedCsvData object (typically from the CSV editor state).
 * @returns A Promise resolving to an ArrayBuffer for the XLSX file.
 */
export const convertCsvDataToExcelArrayBuffer = async (data: ParsedCsvData): Promise<ArrayBuffer> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");

  // Add headers
  if (data.headers && data.headers.length > 0) {
    worksheet.addRow(data.headers);
  }

  // Add data rows
  if (data.rows && data.rows.length > 0) {
    data.rows.forEach(row => {
      worksheet.addRow(row);
    });
  }
  
  // If both headers and rows are empty, add at least one empty cell to create a valid sheet
  if (worksheet.rowCount === 0) {
    worksheet.getCell('A1').value = ''; 
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer; // writeBuffer returns a Buffer, but it's compatible with ArrayBuffer
};

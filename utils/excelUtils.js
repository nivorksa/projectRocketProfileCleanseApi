export const extractColumnNames = (sheet) => {
  const headerRow = sheet.getRow(1);
  return headerRow.values.slice(1); // Skipping first empty value
};

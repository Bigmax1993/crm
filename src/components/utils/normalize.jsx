export const normalizePayer = (payer) => {
  if (!payer) return payer;
  
  return payer
    .toUpperCase()
    .replace(/SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ/g, 'SP. Z O.O.')
    .replace(/SP\. Z O\.O\. SP\. K\.|SP Z O\.O SP\.K\.|SP\. Z O\.O SP\.K\./g, 'SP. Z O.O. SP.K.')
    .replace(/\s+/g, ' ')
    .trim();
};

export const escapeCSV = (value) => {
  if (!value) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};
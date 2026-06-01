const CATEGORY_COLUMNS = {
  "Client Expenses - Accommodation": 7,
  "Client Expenses - Meals": 8,
  "Client Expenses - Entertainment": 9,
  "Client Expenses - Transport": 10,
  "Client Expenses - Miscellaneous": 11,
};

const COLS = [
  { letter: "A", width: 8 },
  { letter: "B", width: 19 },
  { letter: "C", width: 21 },
  { letter: "D", width: 65.33 },
  { letter: "E", width: 26.33 },
  { letter: "F", width: 14.5 },
  { letter: "G", width: 26 },
  { letter: "H", width: 17.66 },
  { letter: "I", width: 21.5 },
  { letter: "J", width: 23.5 },
  { letter: "K", width: 20.5 },
  { letter: "L", width: 17 },
  { letter: "M", width: 24.33 },
  { letter: "N", width: 20.5 },
  { letter: "O", width: 20.16 },
];

const HEADER_ROW = [
  "NO",
  "Receipt / Transaction Date",
  "Description / Purpose",
  "",
  "Receipt Amount",
  "Currency",
  "Accommodation",
  "Meal",
  "Entertainment",
  "Transportation",
  "MISC.",
  "Convert Rate",
  "GBP Amount",
  "Remark",
  "",
];

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index) {
  let name = "";
  while (index > 0) {
    const mod = (index - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    index = Math.floor((index - mod) / 26);
  }
  return name;
}

function cellRef(row, col) {
  return `${columnName(col)}${row}`;
}

function cell(row, col, value, style = 0) {
  if (value === null || value === undefined || value === "") {
    return `<c r="${cellRef(row, col)}"${style ? ` s="${style}"` : ""}/>`;
  }

  if (typeof value === "object" && value.text !== undefined) {
    return `<c r="${cellRef(row, col)}"${style ? ` s="${style}"` : ""} t="inlineStr"><is><t>${escapeXml(value.text)}</t></is></c>`;
  }

  if (typeof value === "object" && value.formula) {
    const formulaValue = value.value === undefined ? "" : `<v>${value.value}</v>`;
    return `<c r="${cellRef(row, col)}"${style ? ` s="${style}"` : ""}><f>${escapeXml(value.formula)}</f>${formulaValue}</c>`;
  }

  if (typeof value === "number") {
    return `<c r="${cellRef(row, col)}"${style ? ` s="${style}"` : ""}><v>${value}</v></c>`;
  }

  return `<c r="${cellRef(row, col)}"${style ? ` s="${style}"` : ""} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function row(rowNumber, values, style = 0, height = null, stylesByCol = {}) {
  const cells = values
    .map((value, idx) => {
      const colStyle = value?.hyperlink ? 11 : style;
      return cell(rowNumber, idx + 1, value, stylesByCol[idx + 1] ?? colStyle);
    })
    .join("");
  const heightAttrs = height ? ` ht="${height}" customHeight="1"` : "";
  return `<row r="${rowNumber}"${heightAttrs}>${cells}</row>`;
}

function formatDateUK(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function getCategoryColumn(category) {
  return CATEGORY_COLUMNS[category] || CATEGORY_COLUMNS["Client Expenses - Miscellaneous"];
}

function getReceiptUrl(item) {
  const primaryReceipt = item.receipt_files?.find(file => file.role === "primary") || item.receipt_files?.[0];
  return item.primary_receipt_file_url
    || item.receipt_url
    || item.receipt_file
    || primaryReceipt?.public_receipt_url
    || primaryReceipt?.file_url
    || item.route_image_url
    || "";
}

function normaliseRows(items) {
  return items.map((item, index) => {
    const amount = money(item.clientAmount ?? item.paid_amount ?? item.total_cost);
    const receiptCode = item.receipt_code || item.route_image_code || "";
    const receiptUrl = getReceiptUrl(item);
    const values = Array(15).fill("");
    values[0] = index + 1;
    values[1] = formatDateUK(item.date);
    values[2] = item.description || "";
    values[4] = amount;
    values[5] = "GBP";
    values[getCategoryColumn(item.category) - 1] = amount;
    values[11] = 1;
    values[12] = amount;
    values[13] = receiptUrl && receiptCode ? { text: receiptCode, hyperlink: receiptUrl } : receiptCode;
    return { values, receiptUrl };
  });
}

function buildSheetXml({ rows, dateRange }) {
  const itemRows = Math.max(rows.length, 10);
  const firstItemRow = 15;
  const totalRow = firstItemRow + itemRows;
  const advanceStart = totalRow + 2;
  const certRow = advanceStart + 5;
  const sigStart = certRow + 8;
  const lastRow = sigStart + 10;

  const sheetRows = [];
  sheetRows.push(row(1, ["EXPENSES CLAIM SUMMARY / RECEIPT FORM", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], 1, 24));
  sheetRows.push(row(2, Array(15).fill(""), 0, 9));
  sheetRows.push(row(7, ["Name: Dream Islands Development 3 Pvt., Ltd", "", "", "", "", "", "Name :", "We Define Travel", "", "", "Travel Period:", dateRange || "", "", "", ""], 2, 27, { 7: 3, 11: 3 }));
  sheetRows.push(row(8, ["Address: H. Millenia Tower, #02-01,", "", "", "", "", "", "Position:", "UK Sales Office", "", "", "", "", "", "", ""], 2, 27, { 7: 3 }));
  sheetRows.push(row(9, ["10 Ameer Ahmed Magu, K. Male' 20026 Maldives", "", "", "", "", "", "Department :", "NA", "", "", "Date Submitted :", formatDateUK(new Date().toISOString()), "", "", ""], 2, 27, { 7: 3, 11: 3 }));
  sheetRows.push(row(10, ["TIN: 1111521GST501", "", "", "", "", "", "Destination :", "UK", "", "", "", "", "", "", ""], 2, 27, { 7: 3 }));
  sheetRows.push(row(11, ["", "", "", "", "", "", "Reason for visit:", "Monthly Sales Costs", "", "", "", "", "", "", ""], 2, 30, { 7: 3 }));
  sheetRows.push(row(13, HEADER_ROW, 4, 34));
  sheetRows.push(row(14, ["", "", "", "", "", "", "", "", "", "", "", "", "", "Receipt", "WHT"], 4, 34));

  const detailRows = normaliseRows(rows);
  const hyperlinks = [];
  for (let i = 0; i < itemRows; i += 1) {
    const rowNumber = firstItemRow + i;
    const detail = detailRows[i];
    const values = detail?.values || [i + 1, "", "", "", "", "GBP", "", "", "", "", "", 1, "", "", ""];
    if (detail?.receiptUrl) {
      hyperlinks.push({ ref: `N${rowNumber}`, id: `rId${hyperlinks.length + 2}`, target: detail.receiptUrl });
    }
    sheetRows.push(row(rowNumber, values, 5, 22, {
      5: 6,
      7: 6,
      8: 6,
      9: 6,
      10: 6,
      11: 6,
      12: 6,
      13: 6,
    }));
  }

  sheetRows.push(row(totalRow, [
    "Total of expense claim for the period (GBP)",
    "", "", "", "", "",
    { formula: `SUM(G${firstItemRow}:G${totalRow - 1})` },
    { formula: `SUM(H${firstItemRow}:H${totalRow - 1})` },
    { formula: `SUM(I${firstItemRow}:I${totalRow - 1})` },
    { formula: `SUM(J${firstItemRow}:J${totalRow - 1})` },
    { formula: `SUM(K${firstItemRow}:K${totalRow - 1})` },
    "",
    { formula: `SUM(M${firstItemRow}:M${totalRow - 1})` },
    "",
    "",
  ], 7, 36, { 7: 8, 8: 8, 9: 8, 10: 8, 11: 8, 13: 8 }));

  sheetRows.push(row(advanceStart, ["In case of Advance : Cash Advance Clearing", "", "", "", "", "", "", "", "", "", "", "", "", "", "Amount (GBP)"], 7, 29));
  sheetRows.push(row(advanceStart + 1, ["Total Advances received for the period", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], 5, 22, { 15: 6 }));
  sheetRows.push(row(advanceStart + 2, ["Total Balance to company", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], 5, 22, { 15: 6 }));
  sheetRows.push(row(advanceStart + 3, ["Total Owing to the Employee", "", "", "", "", "", "", "", "", "", "", "", "", "", { formula: `M${totalRow}` }], 5, 22, { 15: 6 }));

  sheetRows.push(row(certRow, ["*** I certify that the above details are correct for the transaction with receipt and receipt cannot be collected.", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], 9, 36));
  sheetRows.push(row(sigStart, ["Signature :........................................", "", "", "Signature :........................................", "", "", "", "", "", "", "", "", "", "", ""], 10, 22));
  sheetRows.push(row(sigStart + 1, ["Requested By:", "", "", "Approved By Department Head:", "", "", "", "", "", "", "", "", "", "", ""], 10, 22));
  sheetRows.push(row(sigStart + 2, ["Title:", "", "", "Title:", "", "", "", "", "", "", "", "", "", "", ""], 10, 22));
  sheetRows.push(row(sigStart + 3, ["Date :", "", "", "Date :", "", "", "", "", "", "", "", "", "", "", ""], 10, 22));
  sheetRows.push(row(sigStart + 7, ["Signature :........................................", "", "", "Signature :........................................", "", "", "", "", "", "", "", "", "", "", ""], 10, 22));
  sheetRows.push(row(sigStart + 8, ["Approved By:", "", "", "Approved By:", "", "", "", "", "", "", "", "", "", "", ""], 10, 22));
  sheetRows.push(row(sigStart + 9, ["Title: DOF", "", "", "Title: General Manager SO/ Maldives", "", "", "", "", "", "", "", "", "", "", ""], 10, 22));
  sheetRows.push(row(sigStart + 10, ["Date :", "", "", "Date :", "", "", "", "", "", "", "", "", "", "", ""], 10, 22));

  const merges = [
    "A1:O1",
    "A7:F7",
    "A8:F8",
    "A9:F9",
    "A10:F10",
    "C13:D14",
    "A13:A14",
    "B13:B14",
    "E13:E14",
    "F13:F14",
    "G13:G14",
    "H13:H14",
    "I13:I14",
    "J13:J14",
    "K13:K14",
    "L13:L14",
    "M13:M14",
    ...Array.from({ length: itemRows }, (_, index) => `C${firstItemRow + index}:D${firstItemRow + index}`),
    `A${totalRow}:F${totalRow}`,
    `A${advanceStart}:N${advanceStart}`,
    `A${certRow}:O${certRow + 2}`,
  ];

  const hyperlinkXml = hyperlinks.length
    ? `<hyperlinks>${hyperlinks.map(link => `<hyperlink ref="${link.ref}" r:id="${link.id}"/>`).join("")}</hyperlinks>`
    : "";

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:O${lastRow}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${COLS.map((col, index) => `<col min="${index + 1}" max="${index + 1}" width="${col.width}" customWidth="1"/>`).join("")}</cols>
  <sheetData>${sheetRows.join("")}</sheetData>
  <mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>
  ${hyperlinkXml}
  <printOptions horizontalCentered="1"/>
  <pageMargins left="0.47" right="0.25" top="0.42" bottom="0.36" header="0.3" footer="0.3"/>
  <pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
  <drawing r:id="rId1"/>
</worksheet>`;

  const sheetRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
  ${hyperlinks.map(link => `<Relationship Id="${link.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(link.target)}" TargetMode="External"/>`).join("")}
</Relationships>`;

  return { sheetXml, sheetRelsXml };
}

function getLastRow(rowCount) {
  const itemRows = Math.max(rowCount, 10);
  const totalRow = 15 + itemRows;
  const advanceStart = totalRow + 2;
  const certRow = advanceStart + 5;
  const sigStart = certRow + 8;
  return sigStart + 10;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="£#,##0.00;[Red](£#,##0.00);-"/></numFmts>
  <fonts count="5">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="20"/><name val="Aleo"/></font>
    <font><b/><sz val="14"/><name val="Aleo"/></font>
    <font><b/><sz val="16"/><name val="Aleo"/></font>
    <font><u/><sz val="14"/><color rgb="FF0563C1"/><name val="Aleo"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9EAD3"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border>
    <border><left style="thin"/><right style="thin"/><top style="medium"/><bottom style="medium"/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="12">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="3" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function buildWorkbookXml(lastRow) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="FORM" sheetId="1" r:id="rId1"/></sheets>
  <definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'FORM'!$A$1:$O$${lastRow}</definedName></definedNames>
</workbook>`;
}

function buildDrawingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:oneCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>50000</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>50000</xdr:rowOff></xdr:from>
    <xdr:ext cx="1250000" cy="1161320"/>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="2" name="SO Maldives Logo"/>
        <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip r:embed="rId1"/>
        <a:stretch><a:fillRect/></a:stretch>
      </xdr:blipFill>
      <xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>
</xdr:wsDr>`;
}

function buildDrawingRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/so-maldives-logo.jpg"/>
</Relationships>`;
}

async function loadLogoBytes(logoBytes) {
  if (logoBytes) return logoBytes;
  const response = await fetch("/so-maldives-logo.jpg");
  if (!response.ok) {
    throw new Error("Could not load SO/Maldives logo for Excel export");
  }
  return new Uint8Array(await response.arrayBuffer());
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function writeUint16(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function encodeZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  files.forEach(({ name, content }) => {
    const nameBytes = encoder.encode(name);
    const contentBytes = typeof content === "string" ? encoder.encode(content) : new Uint8Array(content);
    const crc = crc32(contentBytes);
    const local = [];
    writeUint32(local, 0x04034b50);
    writeUint16(local, 20);
    writeUint16(local, 0);
    writeUint16(local, 0);
    writeUint16(local, dosTime);
    writeUint16(local, dosDate);
    writeUint32(local, crc);
    writeUint32(local, contentBytes.length);
    writeUint32(local, contentBytes.length);
    writeUint16(local, nameBytes.length);
    writeUint16(local, 0);
    localParts.push(new Uint8Array(local), nameBytes, contentBytes);

    const central = [];
    writeUint32(central, 0x02014b50);
    writeUint16(central, 20);
    writeUint16(central, 20);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, dosTime);
    writeUint16(central, dosDate);
    writeUint32(central, crc);
    writeUint32(central, contentBytes.length);
    writeUint32(central, contentBytes.length);
    writeUint16(central, nameBytes.length);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint32(central, 0);
    writeUint32(central, offset);
    centralParts.push(new Uint8Array(central), nameBytes);

    offset += local.length + nameBytes.length + contentBytes.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = [];
  writeUint32(end, 0x06054b50);
  writeUint16(end, 0);
  writeUint16(end, 0);
  writeUint16(end, files.length);
  writeUint16(end, files.length);
  writeUint32(end, centralSize);
  writeUint32(end, offset);
  writeUint16(end, 0);

  return new Blob([...localParts, ...centralParts, new Uint8Array(end)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function buildSoMaldivesExcelBlob({ reportData, dateRange, logoBytes }) {
  const rows = [...reportData].sort((a, b) => new Date(a.date) - new Date(b.date));
  const lastRow = getLastRow(rows.length);
  const { sheetXml, sheetRelsXml } = buildSheetXml({
    rows,
    dateRange,
  });
  const resolvedLogoBytes = await loadLogoBytes(logoBytes);

  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: buildWorkbookXml(lastRow),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml },
    { name: "xl/worksheets/_rels/sheet1.xml.rels", content: sheetRelsXml },
    { name: "xl/drawings/drawing1.xml", content: buildDrawingXml() },
    { name: "xl/drawings/_rels/drawing1.xml.rels", content: buildDrawingRelsXml() },
    { name: "xl/media/so-maldives-logo.jpg", content: resolvedLogoBytes },
    { name: "xl/styles.xml", content: buildStylesXml() },
    {
      name: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>SO Maldives Expenses Claim</dc:title>
  <dc:creator>We Define Travel</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`,
    },
    {
      name: "docProps/app.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>We Define Travel Expense Tracker</Application>
</Properties>`,
    },
  ];

  return encodeZip(files);
}

export async function downloadSoMaldivesExcel({ reportData, dateRange, dateFrom, dateTo }) {
  const blob = await buildSoMaldivesExcelBlob({ reportData, dateRange });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `SO-Maldives-Expense-Claim-${dateFrom}-to-${dateTo}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

import { jsPDF } from 'jspdf';

/**
 * Convert array of objects to CSV and download
 */
export function exportToCSV(data, filename) {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  // Get headers from first object
  const headers = Object.keys(data[0]);

  // Create CSV content
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        // Escape quotes and wrap in quotes if contains comma or quote
        if (value === null || value === undefined) {
          return '';
        }
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ].join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export to JSON format
 */
export function exportToJSON(data, filename) {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.json`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export to PDF format with table
 */
export function exportToPDF(data, filename, title = '') {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  const doc = new jsPDF();
  const headers = Object.keys(data[0]);
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - 2 * margin;
  const colWidth = contentWidth / headers.length;
  let yPos = 20;

  // Add title if provided
  if (title) {
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(title, margin, 15);
    yPos = 30;
  }

  // Add table header
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.setFillColor(70, 130, 130);
  doc.setTextColor(255, 255, 255);

  headers.forEach((header, i) => {
    doc.rect(margin + i * colWidth, yPos - 5, colWidth, 7, 'F');
    doc.text(header, margin + i * colWidth + 2, yPos, { maxWidth: colWidth - 4 });
  });

  yPos += 8;
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');

  // Add table rows
  let pageNum = 1;
  data.forEach((row, rowIndex) => {
    if (yPos > doc.internal.pageSize.getHeight() - 15) {
      // Add new page
      doc.addPage();
      pageNum++;
      yPos = 20;

      // Repeat header on new page
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setFillColor(70, 130, 130);
      doc.setTextColor(255, 255, 255);

      headers.forEach((header, i) => {
        doc.rect(margin + i * colWidth, yPos - 5, colWidth, 7, 'F');
        doc.text(header, margin + i * colWidth + 2, yPos, { maxWidth: colWidth - 4 });
      });

      yPos += 8;
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'normal');
    }

    // Alternate row colors
    if (rowIndex % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, yPos - 5, contentWidth, 7, 'F');
    }

    headers.forEach((header, i) => {
      const value = row[header] === null || row[header] === undefined ? '' : String(row[header]);
      doc.text(value, margin + i * colWidth + 2, yPos, { maxWidth: colWidth - 4 });
    });

    yPos += 7;
  });

  // Add footer with timestamp
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  const footerText = `Exported on ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}`;
  doc.text(footerText, margin, doc.internal.pageSize.getHeight() - 8);

  doc.save(`${filename}.pdf`);
}

/**
 * Export formulation costing to PDF with proper formatting
 */
export function exportCostingToPDF(formulation, filename = 'costing') {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const contentWidth = pageWidth - 2 * margin;

  let yPosition = 10;

  // Title header with blue background
  doc.setFillColor(100, 150, 180);
  doc.rect(margin, yPosition, contentWidth, 8, 'F');
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`${formulation.productName} for ${formulation.customerName} - ${new Date().toLocaleDateString('en-IN').replace(/\//g, '')}`, margin + 2, yPosition + 5);
  yPosition += 12;

  // Table headers
  const headers = ['Row Materials', 'Percent', 'Rate', 'Cost/Kg', 'Cost/Ltr'];
  const colWidths = [contentWidth * 0.35, contentWidth * 0.15, contentWidth * 0.15, contentWidth * 0.15, contentWidth * 0.20];

  // Draw header row
  doc.setFillColor(150, 180, 200);
  doc.rect(margin, yPosition, contentWidth, 5, 'F');
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(0, 0, 0);

  let xPos = margin;
  headers.forEach((header, i) => {
    doc.text(header, xPos + 1, yPosition + 3.5, { maxWidth: colWidths[i] - 2, align: 'left' });
    xPos += colWidths[i];
  });
  yPosition += 5;

  // Material rows
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');

  if (formulation.breakdown?.base?.items) {
    formulation.breakdown.base.items.forEach((item, idx) => {
      if (yPosition > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPosition = 10;
      }

      // Alternate row colors
      if (idx % 2 === 0) {
        doc.setFillColor(240, 245, 250);
        doc.rect(margin, yPosition, contentWidth, 4, 'F');
      }

      // Draw cell borders
      xPos = margin;
      const rowData = [
        item.name || '-',
        item.percent?.toFixed(2) || '-',
        item.pricePerKg?.toFixed(2) || '-',
        item.costPerKgContribution?.toFixed(2) || '-',
        (item.costPerKgContribution * (formulation.blendedDensity || formulation.litreDensityKgPerL || 1))?.toFixed(2) || '-'
      ];

      rowData.forEach((val, i) => {
        doc.rect(xPos, yPosition, colWidths[i], 4);
        doc.text(String(val), xPos + 1, yPosition + 2.5, { maxWidth: colWidths[i] - 2, align: 'right' });
        xPos += colWidths[i];
      });
      yPosition += 4;
    });
  }

  // Summary rows
  doc.setFont(undefined, 'bold');
  xPos = margin;
  doc.rect(xPos, yPosition, colWidths[0], 4);
  doc.text('>>>>', xPos + 1, yPosition + 2.5, { maxWidth: colWidths[0] - 2 });
  xPos += colWidths[0];

  doc.rect(xPos, yPosition, colWidths[1], 4);
  doc.text('100.00', xPos + 1, yPosition + 2.5, { maxWidth: colWidths[1] - 2, align: 'right' });
  xPos += colWidths[1];

  doc.rect(xPos, yPosition, colWidths[2], 4);
  xPos += colWidths[2];

  doc.rect(xPos, yPosition, colWidths[3], 4);
  doc.text(formulation.total?.toFixed(2) || '-', xPos + 1, yPosition + 2.5, { maxWidth: colWidths[3] - 2, align: 'right' });
  xPos += colWidths[3];

  doc.rect(xPos, yPosition, colWidths[4], 4);
  doc.text((formulation.total * (formulation.blendedDensity || formulation.litreDensityKgPerL || 1))?.toFixed(2) || '-', xPos + 1, yPosition + 2.5, { maxWidth: colWidths[4] - 2, align: 'right' });
  yPosition += 4;

  // Packing row
  doc.setFont(undefined, 'normal');
  xPos = margin;
  doc.rect(xPos, yPosition, colWidths[0], 4);
  doc.text('Add Packing Exp.', xPos + 1, yPosition + 2.5, { maxWidth: colWidths[0] - 2 });
  xPos += colWidths[0];

  for (let i = 1; i < 4; i++) {
    doc.rect(xPos, yPosition, colWidths[i], 4);
    xPos += colWidths[i];
  }

  doc.rect(xPos, yPosition, colWidths[4], 4);
  doc.text(formulation.packingCostPerKg?.toFixed(2) || '-', xPos + 1, yPosition + 2.5, { maxWidth: colWidths[4] - 2, align: 'right' });
  yPosition += 4;

  // Nett row
  doc.setFont(undefined, 'bold');
  xPos = margin;
  doc.rect(xPos, yPosition, colWidths[0], 4);
  doc.text('Nett.', xPos + 1, yPosition + 2.5, { maxWidth: colWidths[0] - 2 });
  xPos += colWidths[0];

  for (let i = 1; i < 4; i++) {
    doc.rect(xPos, yPosition, colWidths[i], 4);
    xPos += colWidths[i];
  }

  doc.rect(xPos, yPosition, colWidths[4], 4);
  doc.text(`₹${formulation.nett?.toFixed(2) || '-'}`, xPos + 1, yPosition + 2.5, { maxWidth: colWidths[4] - 2, align: 'right' });
  yPosition += 4;

  // Weight per litre footer
  doc.setFillColor(150, 180, 200);
  doc.rect(margin, yPosition, contentWidth, 4, 'F');
  doc.setFont(undefined, 'bold');
  xPos = margin;
  doc.rect(xPos, yPosition, colWidths[0], 4);
  doc.text('Wt. Per Litre >>', xPos + 1, yPosition + 2.5, { maxWidth: colWidths[0] - 2 });

  for (let i = 1; i < 4; i++) {
    doc.rect(xPos + colWidths[i - 1], yPosition, colWidths[i], 4);
  }

  xPos = margin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3];
  doc.rect(xPos, yPosition, colWidths[4], 4);
  doc.text((formulation.litreDensityKgPerL || formulation.blendedDensity || '-')?.toFixed(2), xPos + 1, yPosition + 2.5, { maxWidth: colWidths[4] - 2, align: 'right' });

  doc.save(`${filename}.pdf`);
}

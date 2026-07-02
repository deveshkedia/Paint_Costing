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
 * Export formulation costing to PDF
 */
export function exportCostingToPDF(formulation, filename = 'costing') {
  const doc = new jsPDF();
  const margin = 14;

  // Title
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('Formulation Costing Sheet', margin, 15);

  let yPosition = 25;

  // Header info
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(`Product: ${formulation.productName}`, margin, yPosition);
  yPosition += 7;
  doc.text(`Customer: ${formulation.customerName}`, margin, yPosition);
  yPosition += 7;
  doc.text(`Batch Size: ${formulation.batchSizeLitres} litres | Total Weight: ${formulation.totalWeightKg} kg`, margin, yPosition);
  yPosition += 10;

  // Material costs table
  if (formulation.breakdown?.base?.items && formulation.breakdown.base.items.length > 0) {
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Raw Materials', margin, yPosition);
    yPosition += 7;

    // Table header
    const headers = ['Material', 'Qty (kg)', '%', 'Price/kg', 'Cost'];
    const colWidth = 30;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - 2 * margin;
    const actualColWidth = contentWidth / headers.length;

    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setFillColor(70, 130, 130);
    doc.setTextColor(255, 255, 255);

    headers.forEach((header, i) => {
      doc.rect(margin + i * actualColWidth, yPosition - 4, actualColWidth, 6, 'F');
      doc.text(header, margin + i * actualColWidth + 1, yPosition, { maxWidth: actualColWidth - 2 });
    });

    yPosition += 6;
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');

    // Table rows
    formulation.breakdown.base.items.forEach((item, idx) => {
      if (yPosition > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPosition = 20;
      }

      if (idx % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, yPosition - 4, contentWidth, 5, 'F');
      }

      const rowData = [
        item.name || '-',
        item.qtyKg?.toFixed(2) || '-',
        item.percent?.toFixed(2) + '%' || '-',
        item.pricePerKg?.toFixed(2) || '-',
        item.costPerKgContribution?.toFixed(2) || '-',
      ];

      rowData.forEach((val, i) => {
        doc.text(String(val), margin + i * actualColWidth + 1, yPosition, { maxWidth: actualColWidth - 2 });
      });

      yPosition += 5;
    });

    yPosition += 5;
  }

  // Cost summary
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('Cost Summary', margin, yPosition);
  yPosition += 7;

  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.text(`Material Cost (per kg): ₹${formulation.total?.toFixed(2) || '-'}`, margin, yPosition);
  yPosition += 6;
  doc.text(`With Loss (${formulation.lossPct}%): ₹${formulation.totalWithLoss?.toFixed(2) || '-'}`, margin, yPosition);
  yPosition += 6;
  doc.text(`Packing Cost (per kg): ₹${formulation.packingCostPerKg?.toFixed(2) || '-'}`, margin, yPosition);
  yPosition += 6;

  doc.setFont(undefined, 'bold');
  doc.setFontSize(12);
  doc.text(`NETT COST (per kg): ₹${formulation.nett?.toFixed(2) || '-'}`, margin, yPosition);

  if (formulation.nettPerLitre) {
    yPosition += 6;
    doc.text(`NETT COST (per litre): ₹${formulation.nettPerLitre?.toFixed(2) || '-'}`, margin, yPosition);
  }

  // Footer
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(128, 128, 128);
  doc.text(
    `Exported on ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}`,
    margin,
    doc.internal.pageSize.getHeight() - 8
  );

  doc.save(`${filename}.pdf`);
}

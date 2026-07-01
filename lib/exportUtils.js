import jsPDF from 'jspdf';
import 'jspdf-autotable';

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
  const rows = data.map(item =>
    headers.map(header => {
      const value = item[header];
      if (value === null || value === undefined) {
        return '';
      }
      return String(value);
    })
  );

  // Add title if provided
  if (title) {
    doc.setFontSize(16);
    doc.text(title, 14, 15);
  }

  // Add table
  doc.autoTable({
    head: [headers],
    body: rows,
    startY: title ? 25 : 10,
    margin: 10,
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [70, 130, 130], textColor: 255 }, // Teal color
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  // Add footer with timestamp
  const pageCount = doc.getNumberOfPages();
  doc.setFontSize(8);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(
      `Exported on ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}`,
      14,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  doc.save(`${filename}.pdf`);
}

/**
 * Export formulation costing to PDF
 */
export function exportCostingToPDF(formulation, filename = 'costing') {
  const doc = new jsPDF();

  // Title
  doc.setFontSize(18);
  doc.text('Formulation Costing Sheet', 14, 15);

  let yPosition = 25;

  // Header info
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(`Product: ${formulation.productName}`, 14, yPosition);
  yPosition += 7;
  doc.text(`Customer: ${formulation.customerName}`, 14, yPosition);
  yPosition += 7;
  doc.text(`Batch Size: ${formulation.batchSizeKg} kg`, 14, yPosition);
  yPosition += 10;

  // Material costs table
  if (formulation.breakdown?.base?.items) {
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Raw Materials', 14, yPosition);
    yPosition += 7;

    const rows = formulation.breakdown.base.items.map((item) => [
      item.name,
      item.qtyKg?.toFixed(2) || '-',
      item.percent?.toFixed(2) + '%' || '-',
      item.pricePerKg?.toFixed(2) || '-',
      item.costPerKgContribution?.toFixed(2) || '-',
    ]);

    doc.autoTable({
      head: [['Material', 'Qty (kg)', '%', 'Price/kg', 'Cost Contribution']],
      body: rows,
      startY: yPosition,
      margin: 14,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [70, 130, 130], textColor: 255 },
    });

    yPosition = doc.lastAutoTable.finalY + 10;
  }

  // Cost summary
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('Cost Summary', 14, yPosition);
  yPosition += 7;

  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.text(`Material Cost (per kg): ₹${formulation.total?.toFixed(2) || '-'}`, 14, yPosition);
  yPosition += 6;
  doc.text(`With Loss (${formulation.lossPct}%): ₹${formulation.totalWithLoss?.toFixed(2) || '-'}`, 14, yPosition);
  yPosition += 6;
  doc.text(`Packing Cost (per kg): ₹${formulation.packingCostPerKg?.toFixed(2) || '-'}`, 14, yPosition);
  yPosition += 6;

  doc.setFont(undefined, 'bold');
  doc.setFontSize(12);
  doc.text(`NETT COST (per kg): ₹${formulation.nett?.toFixed(2) || '-'}`, 14, yPosition);

  if (formulation.nettPerLitre) {
    yPosition += 6;
    doc.text(`NETT COST (per litre): ₹${formulation.nettPerLitre?.toFixed(2) || '-'}`, 14, yPosition);
  }

  // Footer
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.text(
    `Exported on ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}`,
    14,
    doc.internal.pageSize.getHeight() - 10
  );

  doc.save(`${filename}.pdf`);
}

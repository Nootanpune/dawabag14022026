import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } from 'docx';
import * as fs from 'fs';

// Read the SPECIFICATION.md file
const markdownContent = fs.readFileSync('SPECIFICATION.md', 'utf-8');

// Parse markdown content into document elements
const docChildren: any[] = [];

// Split content into lines
const lines = markdownContent.split('\n');

let inTable = false;
let tableRows: any[] = [];
let currentTableHeaders: string[] = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  // Skip empty lines but continue processing
  if (line === '') {
    if (inTable && tableRows.length > 0) {
      // Add the table to document
      const tableElement = new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      });
      docChildren.push(tableElement);
      tableRows = [];
      currentTableHeaders = [];
      inTable = false;
    }
    docChildren.push(new Paragraph({ text: '' }));
    continue;
  }
  
  // Handle headings
  if (line.startsWith('# ')) {
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: line.substring(2), bold: true, size: 48, color: '1F4E79' })],
      heading: HeadingLevel.TITLE,
      spacing: { before: 400, after: 200 },
    }));
  } else if (line.startsWith('## ')) {
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: line.substring(3), bold: true, size: 36, color: '2E75B6' })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    }));
  } else if (line.startsWith('### ')) {
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: line.substring(4), bold: true, size: 28, color: '4472C4' })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 },
    }));
  } else if (line.startsWith('#### ')) {
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: line.substring(5), bold: true, size: 24 })],
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 200, after: 100 },
    }));
  }
  // Handle table rows (URS Point Matrix)
  else if (line.startsWith('|') && line.includes('|')) {
    inTable = true;
    const cells = line.split('|').filter(c => c.trim() !== '');
    
    if (i > 0 && lines[i-1].trim().startsWith('|') && !lines[i-1].includes('---')) {
      // This is a header row
      if (currentTableHeaders.length === 0) {
        currentTableHeaders = cells.map(c => c.trim());
        // Add header row
        const headerCells = cells.map(cellText => new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: cellText.trim(), bold: true, color: 'FFFFFF' })],
            alignment: AlignmentType.CENTER,
          })],
          shading: { fill: '1F4E79' },
        }));
        tableRows.push(new TableRow({ children: headerCells }));
      } else {
        // Data row
        const dataCells = cells.map(cellText => new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: cellText.trim() })],
          })],
        }));
        tableRows.push(new TableRow({ children: dataCells }));
      }
    }
  }
  // Handle list items
  else if (line.startsWith('- [x]') || line.startsWith('- [ ]')) {
    const isChecked = line.startsWith('- [x]');
    const text = line.substring(6).trim();
    docChildren.push(new Paragraph({
      children: [
        new TextRun({ 
          text: isChecked ? '☑ ' : '☐ ', 
          font: 'Wingdings',
        }),
        new TextRun({ 
          text: text,
          italics: !isChecked,
        }),
      ],
      indent: { left: 720 },
      spacing: { before: 50, after: 50 },
    }));
  }
  // Handle bullet points
  else if (line.startsWith('- ')) {
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: '• ' + line.substring(2) })],
      indent: { left: 720 },
      spacing: { before: 50, after: 50 },
    }));
  }
  // Handle numbered lists
  else if (/^\d+\.\s/.test(line)) {
    const match = line.match(/^(\d+\.\s)(.*)$/);
    if (match) {
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: match[1] + match[2] })],
        indent: { left: 720 },
        spacing: { before: 50, after: 50 },
      }));
    }
  }
  // Handle horizontal rules
  else if (line === '---') {
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: '______________________________________________________________________', color: 'CCCCCC' })],
      spacing: { before: 200, after: 200 },
    }));
  }
  // Handle regular text (including bold)
  else if (!line.startsWith('|')) {
    // Process bold text
    let processedText = line;
    const textRuns: TextRun[] = [];
    
    // Simple bold detection (**text**)
    let remaining = processedText;
    while (remaining.includes('**')) {
      const boldStart = remaining.indexOf('**');
      const boldEnd = remaining.indexOf('**', boldStart + 2);
      
      if (boldEnd === -1) break;
      
      // Add text before bold
      if (boldStart > 0) {
        textRuns.push(new TextRun({ text: remaining.substring(0, boldStart) }));
      }
      
      // Add bold text
      textRuns.push(new TextRun({ text: remaining.substring(boldStart + 2, boldEnd), bold: true }));
      
      remaining = remaining.substring(boldEnd + 2);
    }
    
    // Add remaining text
    if (remaining.length > 0) {
      textRuns.push(new TextRun({ text: remaining }));
    }
    
    if (textRuns.length > 0) {
      docChildren.push(new Paragraph({
        children: textRuns,
        spacing: { before: 50, after: 50 },
      }));
    } else {
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: line })],
        spacing: { before: 50, after: 50 },
      }));
    }
  }
}

// Add any remaining table
if (inTable && tableRows.length > 0) {
  const tableElement = new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
  docChildren.push(tableElement);
}

// Create the document
const doc = new Document({
  sections: [{
    properties: {},
    children: docChildren,
  }],
});

// Generate the Word document
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync('SPECIFICATION.docx', buffer);
  console.log('Word document generated successfully: SPECIFICATION.docx');
});

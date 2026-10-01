// E-prescription PDF in the Telemedicine Practice Guidelines 2020 format: doctor
// name, qualification and council registration (C-22), patient name, age and
// gender, date, mode, diagnosis, medicines (generic names), advice, and a check
// code with a QR link any pharmacy can open (C-24). Rendered on demand from the
// database; never stored.
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export function verifyUrl(code: string): string {
  const site = (process.env.PUBLIC_WEB_URL || (process.env.CORS_ORIGINS || 'https://dawabag.in').split(',')[0]).replace(/\/$/, '');
  return `${site}/eprescriptions/verify/${code}`;
}

const MODE: Record<string, string> = { video: 'Video', audio: 'Audio (phone)', text: 'Text / chat' };

export async function renderEprescriptionPdf(rx: any): Promise<Buffer> {
  const url = verifyUrl(rx.verification_code);
  const qr = await QRCode.toBuffer(url, { errorCorrectionLevel: 'M', margin: 1, width: 200 });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(15).text(`Dr. ${rx.doctor_name}`);
    doc.font('Helvetica').fontSize(9.5).text(rx.doctor_qualification || '')
      .text(`Registration No. ${rx.doctor_reg_no} — ${rx.doctor_council}`);
    doc.image(qr, 595 - 40 - 80, 40, { width: 80 });
    doc.moveDown(0.8).moveTo(40, doc.y).lineTo(555, doc.y).stroke('#999').moveDown(0.6);

    const issued = new Date(rx.issued_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    doc.fontSize(10)
      .text(`Patient: ${rx.patient_name ?? '-'}    Age: ${rx.patient_age ?? '-'}    Gender: ${rx.patient_gender ?? '-'}`)
      .text(`Date: ${issued}    Teleconsultation: ${MODE[rx.consult_mode] ?? rx.consult_mode} (${rx.consult_kind === 'follow_up' ? 'follow-up' : 'first consultation'})`)
      .moveDown(0.6).font('Helvetica-Bold').text('Provisional diagnosis').font('Helvetica').text(rx.diagnosis).moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(13).text('Rx').fontSize(10);
    rx.items.forEach((i: any, n: number) => {
      doc.font('Helvetica-Bold').text(`${n + 1}. ${i.medicine_name}`)
        .font('Helvetica').text(`   ${[i.dosage, i.frequency, i.duration_days ? `for ${i.duration_days} days` : null].filter(Boolean).join(' — ')}`);
      if (i.instructions) doc.text(`   ${i.instructions}`);
    });
    if (rx.advice) doc.moveDown(0.6).font('Helvetica-Bold').text('Advice').font('Helvetica').text(rx.advice);

    doc.moveDown(1.2).fontSize(9).fillColor('#333')
      .text(`Valid until ${new Date(rx.valid_until).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}. Check code: ${rx.verification_code}`)
      .text(`Any pharmacy can verify this prescription at ${url}`)
      .text('Issued electronically through Dawabag teleconsultation under the Telemedicine Practice Guidelines 2020. '
        + 'You may buy these medicines from any pharmacy of your choice.');
    doc.end();
  });
}

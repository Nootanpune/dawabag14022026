// src/services/notifications/templates.ts — the wording of every customer and
// staff message, per channel. SMS text must match the DLT-registered template
// (TRAI); smsVariables() supplies the values the registered template uses.
// ─── Message Builder ──────────────────────────────────────────────────────────
export interface NotificationPayload {
  userId: string;
  type: string;
  orderId?: string;
  orderNumber?: string;
  status?: string;
  awbNumber?: string;
  trackingUrl?: string;
  reason?: string;
  [key: string]: any;
}

export function buildMessage(payload: NotificationPayload) {
  const on = payload.orderNumber || '';

  const messages: Record<string, any> = {
    payment_confirmed: {
      sms: `Dawabag: Payment confirmed for order ${on}. Your order is being processed.`,
      email: {
        subject: `Order ${on} — Payment Confirmed`,
        body: `Your payment has been received. Order ID: ${on}`,
      },
      push: {
        title: 'Payment confirmed',
        body: `Order ${on} is being processed.`,
      },
    },
    rx_pending: {
      sms: `Dawabag: Order ${on} is pending prescription verification. Our pharmacist will call you shortly.`,
      push: { title: 'Prescription pending', body: `Expect a call for order ${on}.` },
    },
    rx_verified: {
      sms: `Dawabag: Prescription verified for order ${on}. Packing in progress.`,
      push: { title: 'Prescription verified', body: `Order ${on} is being packed.` },
    },
    rx_rejected: {
      sms: `Dawabag: Prescription for order ${on} could not be verified. Reason: ${payload.reason || 'Invalid prescription'}. Contact support.`,
      push: { title: 'Prescription rejected', body: `Order ${on} needs a valid prescription.` },
    },
    packed: {
      sms: `Dawabag: Order ${on} packed and ready for dispatch.`,
      push: { title: 'Order packed', body: `Order ${on} is ready to ship.` },
    },
    dispatched: {
      sms: `Dawabag: Order ${on} dispatched via ${payload.courierPartner || 'courier'}. Tracking: ${payload.trackingUrl || payload.awbNumber || 'N/A'}${payload.handoverCode ? `. Delivery code ${payload.handoverCode}: give it only when you receive the sealed pack` : ''}`,
      email: {
        subject: `Order ${on} — Dispatched`,
        body: `Your order has been dispatched. Tracking ID: ${payload.awbNumber}. Track: ${payload.trackingUrl}`,
      },
      push: { title: 'Order dispatched', body: `Track order ${on} — ${payload.awbNumber}` },
    },
    delivered: {
      sms: `Dawabag: Order ${on} delivered successfully. Thank you!`,
      push: { title: 'Delivered!', body: `Order ${on} has been delivered.` },
    },
    refill_reminder: {
      sms: `Dawabag: Time to refill your medicines from order ${on}. Shop now at dawabag.in`,
      push: { title: 'Refill reminder', body: `Your medicines from order ${on} are due for refill.` },
    },
    order_status: {
      sms: `Dawabag: Order ${on} status updated to ${payload.status}.`,
      push: { title: 'Order update', body: `Order ${on}: ${payload.status}` },
    },
    // ── Sprint 2: KYC, licences, credit, stock ──
    kyc_approved: {
      sms: 'Dawabag: Your business account is verified and active. You can now order at trade prices.',
      email: {
        subject: 'Your Dawabag account is approved',
        body: 'Your documents have been verified. Your account is active and trade pricing now applies.',
      },
      push: { title: 'Account approved', body: 'You can now place orders at trade prices.' },
    },
    kyc_rejected: {
      sms: `Dawabag: We could not verify your account. Reason: ${payload.reason || 'documents not valid'}. Re-upload in the app or contact support.`,
      email: {
        subject: 'Action needed: Dawabag account verification',
        body: `We could not verify your account. Reason: ${payload.reason || 'documents not valid'}. Please upload corrected documents in the app.`,
      },
      push: { title: 'Verification failed', body: payload.reason || 'Please re-upload your documents.' },
    },
    licence_expiring: {
      sms: `Dawabag: Your drug licence expires on ${payload.expiryDate}. Upload the renewed licence to keep ordering.`,
      email: {
        subject: 'Your drug licence is expiring',
        body: `Your drug licence on file expires on ${payload.expiryDate}. Upload the renewed licence before then; orders are blocked from the expiry date.`,
      },
    },
    licence_expired: {
      sms: 'Dawabag: Your drug licence on file has expired, so trade orders are paused. Upload the renewed licence to resume.',
      email: {
        subject: 'Trade orders paused: drug licence expired',
        body: 'Your drug licence on file has expired. Trade orders are paused until you upload the renewed licence and we verify it.',
      },
    },
    credit_due: {
      sms: payload.daysBefore > 0
        ? `Dawabag: ${`₹${Math.round((payload.amountPaise || 0) / 100).toLocaleString('en-IN')}`} for order ${on} is due on ${payload.dueDate} (in ${payload.daysBefore} day${payload.daysBefore === 1 ? '' : 's'}).`
        : `Dawabag: ${`₹${Math.round((payload.amountPaise || 0) / 100).toLocaleString('en-IN')}`} for order ${on} is due today (${payload.dueDate}).`,
      email: {
        subject: `Payment reminder: order ${on}`,
        body: `${`₹${Math.round((payload.amountPaise || 0) / 100).toLocaleString('en-IN')}`} for order ${on} is due on ${payload.dueDate}.`,
      },
    },
    // ── Sprint 3: refills ──
    refill_upcoming: {
      sms: payload.autoCharge
        ? `Dawabag: Your refill of about ${`₹${Math.round((payload.amountPaise || 0) / 100).toLocaleString('en-IN')}`} will be ordered and charged to your saved payment method on ${payload.refillDate}. Pause or change it in the app.`
        : `Dawabag: Your refill of about ${`₹${Math.round((payload.amountPaise || 0) / 100).toLocaleString('en-IN')}`} will be ordered on ${payload.refillDate}. Pause or change it in the app.`,
      email: {
        subject: `Refill coming up on ${payload.refillDate}`,
        body: payload.autoCharge
          ? `Your refill (about ${`₹${Math.round((payload.amountPaise || 0) / 100).toLocaleString('en-IN')}`}) will be ordered on ${payload.refillDate} and charged to your saved payment method. Pause or edit it in the app before then.`
          : `Your refill (about ${`₹${Math.round((payload.amountPaise || 0) / 100).toLocaleString('en-IN')}`}) will be ordered on ${payload.refillDate}. You will get a link to pay.`,
      },
      push: { title: 'Refill coming up', body: `Ordering on ${payload.refillDate}` },
    },
    refill_order_created: {
      sms: payload.autoCharged
        ? `Dawabag: Refill order ${on} placed and ${`₹${Math.round((payload.amountPaise || 0) / 100).toLocaleString('en-IN')}`} is being charged to your saved payment method.`
        : payload.needsPrescription
          ? `Dawabag: Refill order ${on} placed. Please pay ${`₹${Math.round((payload.amountPaise || 0) / 100).toLocaleString('en-IN')}`} in the app; a pharmacist will verify your prescription.`
          : `Dawabag: Refill order ${on} placed. Please pay ${`₹${Math.round((payload.amountPaise || 0) / 100).toLocaleString('en-IN')}`} in the app to confirm it.`,
      push: { title: 'Refill order placed', body: payload.autoCharged ? `Order ${on} — charging your saved method` : `Order ${on} — tap to pay` },
    },
    refill_failed: {
      sms: `Dawabag: We could not place your refill order (${payload.reason || 'item unavailable'}). Please order from the app.`,
      push: { title: 'Refill not placed', body: payload.reason || 'Please order from the app.' },
    },
    // ── Sprint 4: complaints (C-36), recalls (C-28) ──
    grievance_update: {
      sms: `Dawabag: Update on complaint ${payload.ticketNo}${payload.status ? ` (${String(payload.status).replace('_', ' ')})` : ''}. See the app for details.`,
      email: {
        subject: `Complaint ${payload.ticketNo} updated`,
        body: `There is an update on your complaint ${payload.ticketNo}. Open the Dawabag app or website to read it.`,
      },
      push: { title: 'Complaint update', body: `Ticket ${payload.ticketNo}` },
    },
    batch_recall: {
      sms: `Dawabag: IMPORTANT. ${payload.productName} batch ${payload.batchNumber} (order ${on}) has been recalled. Please stop using it and contact us for a return and refund.`,
      email: {
        subject: `Recall notice: ${payload.productName} batch ${payload.batchNumber}`,
        body: `${payload.productName} batch ${payload.batchNumber}, supplied in order ${on}, has been recalled (${payload.reason || 'quality alert'}). Please stop using it and contact Dawabag support for a return and full refund.`,
      },
      push: { title: 'Recall notice', body: `Stop using ${payload.productName} batch ${payload.batchNumber}` },
    },
    // ── Sprint 5: cancellation, returns, data requests ──
    order_cancelled: {
      sms: `Dawabag: Order ${on} is cancelled.${payload.amountPaise ? ` Refund of ${`₹${Math.round(payload.amountPaise / 100).toLocaleString('en-IN')}`} started.` : ''}`,
      email: {
        subject: `Order ${on} cancelled`,
        body: `Your order ${on} has been cancelled (${payload.reason || 'on request'}).${payload.amountPaise ? ` A refund of ${`₹${Math.round(payload.amountPaise / 100).toLocaleString('en-IN')}`} has been started to your original payment method.` : ''}`,
      },
      push: { title: 'Order cancelled', body: `Order ${on}` },
    },
    return_update: {
      sms: payload.status === 'approved'
        ? `Dawabag: Return ${payload.returnNo} approved. Refund of ${`₹${Math.round((payload.amountPaise || 0) / 100).toLocaleString('en-IN')}`} started.`
        : `Dawabag: Return ${payload.returnNo} was not approved: ${payload.reason || 'see the app'}.`,
      push: { title: 'Return update', body: `Return ${payload.returnNo}: ${payload.status}` },
    },
    data_request_update: {
      email: {
        subject: `Your ${payload.requestType} request`,
        body: `Your ${payload.requestType} request has been ${payload.status}. ${payload.reason || ''}`,
      },
      push: { title: 'Privacy request update', body: `Your ${payload.requestType} request: ${payload.status}` },
    },
    // Sprint 30: a partner's, supplier's or buyer's drug licence nearing expiry (C-07)
    party_licence_expiring: {
      email: { subject: 'Drug licence renewal due', body: payload.text || '' },
      push: { title: 'Drug licence renewal due', body: payload.text || '' },
    },
    business_licence_expiring: {
      email: { subject: 'Licence renewal due', body: payload.text || '' },
      push: { title: 'Licence renewal due', body: payload.text || '' },
    },
    adr_serious: {
      push: { title: 'Serious side-effect report', body: `${payload.reportNo}: ${payload.productName}. Review and forward to PvPI within 15 days.` },
      email: { subject: `Serious side-effect report ${payload.reportNo}`, body: `A serious suspected reaction to ${payload.productName} was reported (${payload.reportNo}). Review it and forward it to PvPI within 15 days.` },
    },
    security_incident: {
      email: { subject: `Security incident ${payload.incidentNo} (${payload.severity})`,
        body: `A security incident ${payload.incidentNo} was logged. If it is reportable, CERT-In must be informed by ${payload.dueAt}.` },
      push: { title: `Security incident ${payload.incidentNo}`, body: 'Report to CERT-In within 6 hours if reportable' },
    },
    // ── Sprint 15: a scheduled job started failing (staff only) ──
    job_failed: {
      email: { subject: `Scheduled job ${payload.reportNo} is failing`,
        body: `The scheduled job ${payload.reportNo} failed: ${payload.reason}. It retries on its schedule; check Admin → Jobs and the logs. You will not be told again until it has succeeded once.` },
      push: { title: `Job ${payload.reportNo} failing`, body: String(payload.reason || '').slice(0, 100) },
    },
    // ── Sprint 14: regulator recall alerts (C-28), staff only ──
    recall_alert: {
      email: { subject: `Recall alert ${payload.reportNo}: ${payload.count} product(s) to check`,
        body: `${payload.reason}. ${payload.count} of our product batch(es) match the list. Recall or clear each one by ${payload.dueAt} (4 hours from receipt). Open Admin → Recall alerts.` },
      push: { title: `Recall alert ${payload.reportNo}`, body: `${payload.count} match(es) to decide by ${payload.dueAt}` },
    },
    recall_alert_overdue: {
      email: { subject: `OVERDUE: recall alert ${payload.reportNo}`,
        body: `Recall alert ${payload.reportNo} is past its 4-hour deadline with ${payload.count} match(es) undecided. Open Admin → Recall alerts now.` },
      push: { title: `Overdue recall alert ${payload.reportNo}`, body: `${payload.count} match(es) still undecided` },
    },
    expiry_watch: {
      email: { subject: `Expiry watch: ${payload.expired} expired, ${payload.nearExpiry} near expiry`,
        body: `${payload.expired} expired batch(es) were raised for write-off approval; ${payload.nearExpiry} batch(es) expire within ${payload.days} days. Open Admin → Stock.` },
      push: { title: 'Expiry watch', body: `${payload.expired} expired · ${payload.nearExpiry} near expiry` },
    },
    // ── Sprint 10: teleconsultation ──
    eprescription_issued: {
      sms: `Dawabag: Your doctor has issued your e-prescription (check code ${payload.reportNo}). Buy the medicines from any pharmacy you choose.`,
      push: { title: 'E-prescription ready', body: 'Download it from your consultations. You may use any pharmacy.' },
    },
    // ── Sprint 8: courier tracking ──
    out_for_delivery: {
      sms: `Dawabag: Order ${on} is out for delivery today.${payload.codeNeeded ? ' Keep your delivery code ready (see the app).' : ''}`,
      push: { title: 'Out for delivery', body: payload.codeNeeded ? `Order ${on} arrives today. Keep your delivery code ready.` : `Order ${on} arrives today.` },
    },
    courier_rx_delivered: {
      email: { subject: `Confirm handover: order ${on}`, body: `The courier reports AWB ${payload.awbNumber} (order ${on}) delivered, but this prescription parcel needs the buyer's delivery code. Confirm with the buyer and record the handover in Admin → Deliveries.` },
      push: { title: 'Confirm prescription handover', body: `Order ${on}: courier says delivered — confirm with the buyer` },
    },
    courier_rto: {
      email: { subject: `Returning to origin: order ${on}`, body: `AWB ${payload.awbNumber} (order ${on}) is returning to us undelivered. Contact the buyer; returned medicines go to the destruction register, never back on sale.` },
      push: { title: 'Parcel returning (RTO)', body: `Order ${on} — AWB ${payload.awbNumber}` },
    },
    low_stock_digest: {
      email: {
        subject: `Low stock: ${payload.count} product(s) at or below reorder level`,
        body: payload.html || '',
      },
    },
  };

  return messages[payload.type] || null;
}


const rupees = (p?: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

// Values a DLT template may reference, by name (configured in sms.dlt_templates)
export function smsVariables(p: NotificationPayload): Record<string, string> {
  const v: Record<string, unknown> = {
    order_number: p.orderNumber, status: p.status, awb: p.awbNumber, courier: p.courierPartner,
    tracking_url: p.trackingUrl, reason: p.reason, amount: p.amountPaise != null ? rupees(p.amountPaise) : undefined,
    date: p.refillDate ?? p.dueDate ?? p.expiryDate, code: p.handoverCode, otp: p.otp, ticket: p.ticketNo,
    return_no: p.returnNo, product: p.productName, batch: p.batchNumber, report_no: p.reportNo,
  };
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x != null && x !== '').map(([k, x]) => [k, String(x)]));
}

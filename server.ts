import http from 'http';
import path from 'path';
import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { AqarStore } from './server/store';
import { extractDocumentDataWithGemini } from './server/ocr';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const store = new AqarStore();

interface ClientSession {
  ws: WebSocket;
  sessionId: string;
  userId: string;
  deviceName: string;
  ipAddress: string;
  connectedAt: string;
}

const activeSessions = new Map<WebSocket, ClientSession>();

function extractClientIp(req: http.IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  const remote = req.socket?.remoteAddress || '127.0.0.1';
  return remote.replace(/^::ffff:/, '');
}

function getPresenceList() {
  const state = store.getState();
  const seen = new Map<
    string,
    {
      sessionId: string;
      userId: string;
      nameAr: string;
      roleLabelAr: string;
      deviceName: string;
      ipAddress: string;
      connectedAt: string;
    }
  >();
  for (const s of activeSessions.values()) {
    const user = state.users.find((u) => u.id === s.userId);
    if (user) {
      seen.set(s.sessionId, {
        sessionId: s.sessionId,
        userId: user.id,
        nameAr: user.nameAr,
        roleLabelAr: user.roleLabelAr,
        deviceName: s.deviceName || user.deviceName,
        ipAddress: s.ipAddress,
        connectedAt: s.connectedAt,
      });
    }
  }
  return Array.from(seen.values());
}

function broadcastPresence() {
  const payload = JSON.stringify({ type: 'presence:update', sessions: getPresenceList() });
  for (const client of activeSessions.keys()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastStateChange(actorUserId: string, eventSummary: string) {
  for (const [client, session] of activeSessions.entries()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: 'state:updated',
          actorUserId,
          summary: eventSummary,
          state: store.getStateForUser(session.userId),
        })
      );
    }
  }
}

function getActor(req: Request): { userId: string; deviceName?: string; ipAddress: string } {
  const userId = String(req.headers['x-user-id'] || req.query.userId || 'usr-gm');
  const rawDevice = req.headers['x-device-name'];
  const deviceName = rawDevice ? decodeURIComponent(String(rawDevice)) : undefined;
  return { userId, deviceName, ipAddress: extractClientIp(req) };
}

function handleApi(app: express.Express) {
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, lastUpdatedAt: store.getState().lastUpdatedAt });
  });

  app.get('/api/state', (req: Request, res: Response) => {
    const { userId } = getActor(req);
    res.json({
      state: store.getStateForUser(userId),
      presence: getPresenceList(),
    });
  });

  app.post('/api/properties', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const property = store.createProperty(userId, req.body, deviceName);
      broadcastStateChange(userId, `تمت إضافة العقار ${property.nameAr}`);
      res.status(201).json({ property, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/units', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const unit = store.createUnit(userId, req.body, deviceName);
      broadcastStateChange(userId, `تمت إضافة الوحدة ${unit.unitNumber}`);
      res.status(201).json({ unit, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.patch('/api/units/:id/status', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const unit = store.updateUnitStatus(userId, String(req.params.id), req.body.status, req.body.reason, deviceName);
      broadcastStateChange(userId, `تغيير حالة الوحدة ${unit.unitNumber} إلى ${unit.status}`);
      res.json({ unit, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/units/:id/link-tenant', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const unit = store.linkTenantToUnit(userId, String(req.params.id), req.body.tenantId, deviceName);
      broadcastStateChange(userId, `ربط إداري للوحدة ${unit.unitNumber}`);
      res.json({ unit, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/tenants', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const tenant = store.createTenant(userId, req.body, deviceName);
      broadcastStateChange(userId, `تسجيل المستأجر ${tenant.nameAr}`);
      res.status(201).json({ tenant, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.delete('/api/tenants/:id', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      store.deleteTenant(userId, String(req.params.id), deviceName);
      broadcastStateChange(userId, `حذف ملف مستأجر`);
      res.json({ ok: true, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/leads', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const lead = store.createLead(userId, req.body, deviceName);
      broadcastStateChange(userId, `تسجيل عميل محتمل ${lead.nameAr}`);
      res.status(201).json({ lead, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/contracts', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const result = store.createContract(userId, req.body, deviceName);
      broadcastStateChange(userId, `إنشاء العقد ${result.contract.internalNumber}`);
      res.status(201).json({ ...result, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.patch('/api/contracts/:id/ejar', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const contract = store.updateContractEjarStatus(
        userId,
        String(req.params.id),
        req.body.ejarNumber,
        req.body.ejarStatus,
        req.body.lifecycleStatus,
        deviceName
      );
      broadcastStateChange(userId, `تحديث توثيق العقد ${contract.internalNumber}`);
      res.json({ contract, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/handovers', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const handover = store.createHandoverInspection(userId, req.body, deviceName);
      broadcastStateChange(userId, `إنشاء محضر ${handover.type}`);
      res.status(201).json({ handover, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/handovers/:id/approve', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const handover = store.approveHandover(userId, String(req.params.id), req.body.nextUnitStatus, deviceName);
      broadcastStateChange(userId, `اعتماد محضر الاستلام والإخلاء`);
      res.json({ handover, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/payments', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const idempotencyKey =
        String(req.headers['x-idempotency-key'] || req.body.idempotencyKey || '') ||
        `srv-${Date.now()}-${Math.random()}`;
      const payment = store.recordPayment(userId, { ...req.body, idempotencyKey }, deviceName);
      broadcastStateChange(userId, `إصدار سند قبض ${payment.receiptNumber} (${payment.amount.toLocaleString()} ر.س)`);
      res.status(201).json({ payment, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/payments/:id/reverse', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const payment = store.reverseReceipt(userId, String(req.params.id), req.body.reason, deviceName);
      broadcastStateChange(userId, `عكس السند ${payment.receiptNumber}`);
      res.json({ payment, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/expenses', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const expense = store.createExpense(userId, req.body, deviceName);
      broadcastStateChange(userId, `تسجيل مصروف ${expense.expenseNumber}`);
      res.status(201).json({ expense, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/expenses/:id/decision', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const expense = store.decideExpense(userId, String(req.params.id), req.body.decision, req.body.reason, deviceName);
      broadcastStateChange(userId, `قرار اعتماد المصروف ${expense.expenseNumber}: ${expense.approvalStatus}`);
      res.json({ expense, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/tickets', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const ticket = store.createTicket(userId, req.body, deviceName);
      broadcastStateChange(userId, `فتح بلاغ صيانة ${ticket.ticketNumber}`);
      res.status(201).json({ ticket, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.patch('/api/tickets/:id', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const ticket = store.updateTicket(userId, String(req.params.id), req.body, deviceName);
      broadcastStateChange(userId, `تحديث بلاغ الصيانة ${ticket.ticketNumber}`);
      res.json({ ticket, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/tasks', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const task = store.createTask(userId, req.body, deviceName);
      broadcastStateChange(userId, `إضافة مهمة: ${task.title}`);
      res.status(201).json({ task, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.patch('/api/tasks/:id', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const task = store.updateTask(userId, String(req.params.id), req.body, deviceName);
      broadcastStateChange(userId, `تحديث مهمة: ${task.title}`);
      res.json({ task, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/tasks/:id/reassign', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const task = store.reassignTask(
        userId,
        String(req.params.id),
        String(req.body.assignedTo || ''),
        req.body.reason ? String(req.body.reason) : undefined,
        deviceName
      );
      broadcastStateChange(userId, `تحويل مهمة: ${task.title}`);
      res.json({ task, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/tasks/:id/review', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const task = store.reviewTask(
        userId,
        String(req.params.id),
        req.body.decision === 'reject' ? 'reject' : 'approve',
        req.body.reason ? String(req.body.reason) : undefined,
        deviceName
      );
      broadcastStateChange(userId, `مراجعة واعتماد مهمة: ${task.title}`);
      res.json({ task, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/communications', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const log = store.addCommunication(userId, req.body, deviceName);
      broadcastStateChange(userId, `تسجيل تواصل مع ${log.targetName}`);
      res.status(201).json({ log, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/documents', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const doc = store.addDocument(userId, req.body, deviceName);
      broadcastStateChange(userId, `أرشفة مستند ${doc.title}`);
      res.status(201).json({ doc, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/vendors', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const vendor = store.createVendor(userId, req.body, deviceName);
      broadcastStateChange(userId, `إضافة المورد ${vendor.nameAr}`);
      res.status(201).json({ vendor, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/permissions/toggle', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const rolePermissions = store.toggleRolePermission(userId, req.body.role, req.body.permission, deviceName);
      broadcastStateChange(userId, `تحديث صلاحيات الدور ${req.body.role}`);
      res.json({ rolePermissions, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/notifications/read', (req: Request, res: Response) => {
    try {
      const { userId } = getActor(req);
      store.markNotificationsRead(userId);
      res.json({ ok: true, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/backups', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const backup = store.createBackup(userId, req.body.label, deviceName);
      broadcastStateChange(userId, `إنشاء نسخة احتياطية`);
      res.status(201).json({ backup, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/backups/:id/restore', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const restored = store.restoreBackup(userId, String(req.params.id), deviceName);
      broadcastStateChange(userId, `استعادة نسخة احتياطية`);
      res.json({ ok: true, state: restored });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/reminders/rules', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const rule = store.createReminderRule(userId, req.body, deviceName);
      broadcastStateChange(userId, `إضافة قاعدة جدولة تنبيه إيجار: ${rule.nameAr}`);
      res.status(201).json({ rule, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.patch('/api/reminders/rules/:id', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const rule = store.toggleReminderRule(userId, String(req.params.id), Boolean(req.body.enabled), deviceName);
      broadcastStateChange(userId, `تحديث جدولة التنبيه ${rule.nameAr}`);
      res.json({ rule, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.delete('/api/reminders/rules/:id', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      store.deleteReminderRule(userId, String(req.params.id), deviceName);
      broadcastStateChange(userId, `حذف قاعدة تنبيه إيجار`);
      res.json({ ok: true, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/reminders/run', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const logs = store.runReminderScheduler(userId, req.body, deviceName);
      broadcastStateChange(userId, `تشغيل تنبيهات الإيجار (${logs.length} إشعار مرسل)`);
      res.json({ logs, count: logs.length, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/companies', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const company = store.createCompany(userId, req.body, deviceName);
      broadcastStateChange(userId, `إضافة الشركة ${company.nameAr}`);
      res.status(201).json({ company, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.patch('/api/settings', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const settings = store.updateSettings(userId, req.body, deviceName);
      broadcastStateChange(userId, `تحديث إعدادات المنشأة والعملات`);
      res.json({ settings, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/documents/ocr', async (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const result = await extractDocumentDataWithGemini({
        dataUrl: String(req.body?.dataUrl || ''),
        mimeType: req.body?.mimeType ? String(req.body.mimeType) : undefined,
        fileName: req.body?.fileName ? String(req.body.fileName) : undefined,
        categoryHint: req.body?.categoryHint ? String(req.body.categoryHint) : undefined,
      });
      const matches = store.findOcrEntityMatches(result.extracted);

      if (req.body?.autoSync) {
        const synced = store.syncOcrToEntities(
          userId,
          {
            extracted: result.extracted,
            targetTenantId: req.body?.targetTenantId ? String(req.body.targetTenantId) : undefined,
            targetPropertyId: req.body?.targetPropertyId ? String(req.body.targetPropertyId) : undefined,
            applyTenant: req.body?.applyTenant,
            applyProperty: req.body?.applyProperty,
            createMissing: req.body?.createMissing,
          },
          deviceName
        );
        broadcastStateChange(userId, `استخراج OCR وربط البيانات آلياً بالمستأجرين والعقارات`);
        return res.json({
          ...result,
          matches,
          syncSummary: synced.summary,
          state: store.getStateForUser(userId),
        });
      }

      res.json({ ...result, matches });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/documents/sync-ocr', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      if (!req.body?.extracted) {
        throw new Error('بيانات الاستخراج الضوئي (extracted) مطلوبة لعملية الربط');
      }
      const synced = store.syncOcrToEntities(
        userId,
        {
          extracted: req.body.extracted,
          docId: req.body?.docId ? String(req.body.docId) : undefined,
          targetTenantId: req.body?.targetTenantId ? String(req.body.targetTenantId) : undefined,
          targetPropertyId: req.body?.targetPropertyId ? String(req.body.targetPropertyId) : undefined,
          applyTenant: req.body?.applyTenant,
          applyProperty: req.body?.applyProperty,
          createMissing: req.body?.createMissing,
        },
        deviceName
      );
      broadcastStateChange(userId, `ربط نتائج OCR بحقول المستأجرين والعقارات`);
      res.json({ ...synced, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/documents/:id/access', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const doc = store.recordDocumentAccess(userId, String(req.params.id), req.body.action || 'معاينة', deviceName);
      broadcastStateChange(userId, `سجل وصول للمستند ${doc.title}`);
      res.json({ doc, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/documents/:id/ocr', async (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const docExisting = store.getState().documents.find((d) => d.id === String(req.params.id));
      const dataUrl = String(req.body?.dataUrl || docExisting?.dataUrl || '');
      const result = await extractDocumentDataWithGemini({
        dataUrl,
        fileName: docExisting?.fileName,
        categoryHint: docExisting?.category,
      });
      const doc = store.attachDocumentOcr(userId, String(req.params.id), result.extracted, result.rawText, deviceName);
      const matches = store.findOcrEntityMatches(result.extracted);
      let syncSummary;
      if (req.body?.autoSync !== false) {
        const synced = store.syncOcrToEntities(
          userId,
          {
            extracted: result.extracted,
            docId: doc.id,
            createMissing: false,
          },
          deviceName
        );
        syncSummary = synced.summary;
      }
      broadcastStateChange(userId, `تحليل OCR للمستند ${doc.title}`);
      res.json({
        doc,
        extracted: result.extracted,
        matches,
        syncSummary,
        state: store.getStateForUser(userId),
      });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/owners/:id/transfer', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const result = store.recordOwnerTransfer(userId, String(req.params.id), req.body, deviceName);
      broadcastStateChange(userId, `تحويل مستحقات للمالك ${result.owner.nameAr}`);
      res.status(201).json({ ...result, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/contracts/:id/renew', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const result = store.renewContract(userId, String(req.params.id), req.body, deviceName);
      broadcastStateChange(userId, `تجديد العقد ${result.contract.internalNumber}`);
      res.status(201).json({ ...result, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/purchase-orders', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const po = store.createPurchaseOrder(userId, req.body, deviceName);
      broadcastStateChange(userId, `إنشاء طلب شراء ${po.poNumber}`);
      res.status(201).json({ po, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.patch('/api/purchase-orders/:id', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const po = store.updatePurchaseOrder(userId, String(req.params.id), req.body, deviceName);
      broadcastStateChange(userId, `تحديث طلب شراء ${po.poNumber}`);
      res.json({ po, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/decisions', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const decision = store.createDecision(userId, req.body, deviceName);
      broadcastStateChange(userId, `إصدار قرار إداري ${decision.decisionNumber}`);
      res.status(201).json({ decision, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.patch('/api/tenants/:id/checklist', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const tenant = store.updateTenantChecklist(userId, String(req.params.id), req.body, deviceName);
      broadcastStateChange(userId, `تحديث قائمة سياسة التسكين للمستأجر ${tenant.nameAr}`);
      res.json({ tenant, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/import/bulk', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const summary = store.bulkImportRecords(userId, req.body.type, req.body.rows, deviceName);
      broadcastStateChange(userId, `استيراد جماعي من Excel (${summary.inserted} سجل)`);
      res.status(201).json({ ...summary, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/workspace/reset-fresh', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const fresh = store.resetToFreshWorkspace(userId, deviceName);
      broadcastStateChange(userId, 'تهيئة مساحة عمل نظيفة عبر الإعداد الأولي');
      res.json({ ok: true, state: fresh });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // Smart Archive Center Endpoints
  app.post('/api/archive/move', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const result = store.archiveEntity(userId, req.body, deviceName);
      broadcastStateChange(userId, result.summary);
      res.json({ ...result, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/archive/restore', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const result = store.restoreArchivedEntity(userId, req.body, deviceName);
      broadcastStateChange(userId, result.restoredSummary);
      res.json({ ...result, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      const msg = (e as Error).message || '';
      const isConflict = msg.startsWith('CONFLICT_ACTIVE_CONTRACT:');
      res.status(isConflict ? 409 : 400).json({ error: msg, conflict: isConflict });
    }
  });

  app.post('/api/archive/run-scheduled', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const result = store.runScheduledArchival(userId, deviceName);
      broadcastStateChange(userId, result.summary);
      res.json({ ...result, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/archive/filters', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const filter = store.saveArchiveFilter(userId, req.body, deviceName);
      broadcastStateChange(userId, `حفظ فلتر الأرشيف "${filter.name}"`);
      res.status(201).json({ filter, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.delete('/api/archive/filters/:id', (req: Request, res: Response) => {
    try {
      const { userId } = getActor(req);
      store.deleteArchiveFilter(userId, String(req.params.id));
      res.json({ ok: true, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // Team & Workforce Management Endpoints
  app.post('/api/team/users', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const user = store.createStaffUser(userId, req.body, deviceName);
      broadcastStateChange(userId, `إضافة موظف جديد: ${user.nameAr}`);
      res.status(201).json({ user, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.patch('/api/team/users/:id', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const user = store.updateStaffUser(userId, String(req.params.id), req.body, deviceName);
      broadcastStateChange(userId, `تحديث ملف الموظف: ${user.nameAr}`);
      res.json({ user, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.patch('/api/team/security-policy', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const securityPolicy = store.updateSecurityPolicy(userId, req.body, deviceName);
      broadcastStateChange(userId, `تحديث سياسة الأمان وكلمات المرور`);
      res.json({ securityPolicy, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/team/conflicts/:id/resolve', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const resolution =
        req.body.resolution === 'تم الإبقاء على النسخة السابقة'
          ? 'تم الإبقاء على النسخة السابقة'
          : 'تم اعتماد التعديل الأحدث';
      const conflict = store.resolveSyncConflict(userId, String(req.params.id), resolution, deviceName);
      broadcastStateChange(userId, `معالجة تعارض مزامنة: ${conflict.entityLabel}`);
      res.json({ conflict, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/team/sessions/terminate', (req: Request, res: Response) => {
    try {
      const { userId, deviceName, ipAddress } = getActor(req);
      const state = store.getState();
      const actor = state.users.find((u) => u.id === userId);
      if (!actor || !(state.rolePermissions[actor.role] || []).includes('manage_users')) {
        throw new Error('لا تملك صلاحية إنهاء الجلسات عن بُعد');
      }
      const targetUserId = req.body.userId ? String(req.body.userId) : undefined;
      const targetSessionId = req.body.sessionId ? String(req.body.sessionId) : undefined;
      const reason = String(req.body.reason || 'إنهاء جلسة إداري عن بُعد');

      let terminatedCount = 0;
      for (const [client, session] of Array.from(activeSessions.entries())) {
        const matchesSession = targetSessionId && session.sessionId === targetSessionId;
        const matchesUser = !targetSessionId && targetUserId && session.userId === targetUserId;
        if (matchesSession || matchesUser) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: 'session:terminated',
                userId: session.userId,
                sessionId: session.sessionId,
                reason,
                terminatedBy: actor.nameAr,
              })
            );
          }
          activeSessions.delete(client);
          try {
            client.close(4001, 'Terminated by administrator');
          } catch {
            // ignore
          }
          terminatedCount += 1;
        }
      }

      if (targetUserId) {
        store.recordLoginEvent({
          userId: targetUserId,
          deviceName: deviceName || 'لوحة إدارة الفريق',
          ipAddress,
          method: 'تسجيل خروج عن بُعد',
          success: true,
        });
      }

      broadcastPresence();
      broadcastStateChange(userId, `إنهاء ${terminatedCount} جلسة نشطة عن بُعد`);
      res.json({
        ok: true,
        terminatedCount,
        presence: getPresenceList(),
        state: store.getStateForUser(userId),
      });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/security/logout-others', (req: Request, res: Response) => {
    try {
      const { userId, deviceName, ipAddress } = getActor(req);
      const keepSessionId = req.body?.keepSessionId ? String(req.body.keepSessionId) : undefined;
      let terminatedCount = 0;
      for (const [client, session] of Array.from(activeSessions.entries())) {
        if (session.userId === userId && (!keepSessionId || session.sessionId !== keepSessionId)) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: 'session:terminated',
                userId: session.userId,
                sessionId: session.sessionId,
                reason: 'تم تسجيل الخروج من جميع الأجهزة الأخرى عبر مركز الأمان',
              })
            );
          }
          activeSessions.delete(client);
          try {
            client.close(4001, 'Logged out from security center');
          } catch {
            // ignore
          }
          terminatedCount += 1;
        }
      }
      store.recordLoginEvent({
        userId,
        deviceName: deviceName || 'مركز الأمان',
        ipAddress,
        method: 'تسجيل خروج عن بُعد',
        success: true,
      });
      broadcastPresence();
      broadcastStateChange(userId, `تسجيل الخروج من جميع الأجهزة الأخرى (${terminatedCount} جلسة)`);
      res.json({ ok: true, terminatedCount, presence: getPresenceList(), state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get('/api/backups/:id/preview', (req: Request, res: Response) => {
    try {
      const preview = store.previewBackup(String(req.params.id));
      res.json(preview);
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/system/clear-temp', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const settings = store.clearTempCache(userId, deviceName);
      broadcastStateChange(userId, 'تنظيف الملفات المؤقتة من مركز الإعدادات');
      res.json({ settings, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // Communication Templates Endpoints
  app.post('/api/templates', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const template = store.createTemplate(userId, req.body, deviceName);
      broadcastStateChange(userId, `إنشاء قالب تواصل: ${template.name}`);
      res.status(201).json({ template, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.patch('/api/templates/:id', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const template = store.updateTemplate(userId, String(req.params.id), req.body, deviceName);
      broadcastStateChange(userId, `تحديث قالب التواصل: ${template.name}`);
      res.json({ template, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.delete('/api/templates/:id', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      store.deleteTemplate(userId, String(req.params.id), deviceName);
      broadcastStateChange(userId, 'حذف قالب تواصل');
      res.json({ ok: true, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/templates/:id/use', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const result = store.useTemplate(userId, String(req.params.id), req.body, deviceName);
      broadcastStateChange(userId, `إرسال رسالة لقالب ${result.template?.name || ''}`);
      res.json({ ...result, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/templates/import', (req: Request, res: Response) => {
    try {
      const { userId, deviceName } = getActor(req);
      const templates = Array.isArray(req.body?.templates) ? req.body.templates : [];
      const count = store.importTemplates(userId, templates, deviceName);
      broadcastStateChange(userId, `استيراد ${count} قالب تواصل`);
      res.status(201).json({ count, state: store.getStateForUser(userId) });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
}

async function startServer() {
  const app = express();
  handleApi(app);

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const sessionId = `ses-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ipAddress = extractClientIp(req);
    activeSessions.set(ws, {
      ws,
      sessionId,
      userId: 'usr-gm',
      deviceName: 'Web Browser',
      ipAddress,
      connectedAt: new Date().toISOString(),
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'session:identify') {
          const prev = activeSessions.get(ws);
          const nextUserId = String(msg.userId || 'usr-gm');
          const nextDevice = String(msg.deviceName || 'Web Browser');
          const shouldLogLogin = !prev || prev.userId !== nextUserId;
          activeSessions.set(ws, {
            ws,
            sessionId: prev?.sessionId || sessionId,
            userId: nextUserId,
            deviceName: nextDevice,
            ipAddress,
            connectedAt: prev?.connectedAt || new Date().toISOString(),
          });
          if (shouldLogLogin) {
            store.recordLoginEvent({
              userId: nextUserId,
              deviceName: nextDevice,
              ipAddress,
              method: 'كلمة المرور',
              success: true,
            });
          }
          ws.send(
            JSON.stringify({
              type: 'state:init',
              state: store.getStateForUser(nextUserId),
              presence: getPresenceList(),
            })
          );
          broadcastPresence();
        }
      } catch {
        // Ignore malformed WS payloads
      }
    });

    ws.on('close', () => {
      activeSessions.delete(ws);
      broadcastPresence();
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AqarPlus centralized server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

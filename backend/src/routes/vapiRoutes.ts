import { Router } from 'express';
import { VapiController } from '../controllers/vapiController';

const router = Router();
const vapiController = new VapiController();

// Add OPTIONS for CORS preflight
router.options('/webhook', (_req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

// Main webhook endpoint
router.post('/webhook', vapiController.handleWebhook.bind(vapiController));

// Health check for Vapi to verify endpoint
router.get('/webhook/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;

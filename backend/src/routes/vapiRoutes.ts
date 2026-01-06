import { Router } from 'express';
import { VapiController } from '../controllers/vapiController';

const router = Router();
const vapiController = new VapiController();

// Vapi webhook endpoint for function calls and events
router.post('/webhook', vapiController.handleWebhook);

export default router;

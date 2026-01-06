import { Router } from 'express';
import { SessionController } from '../controllers/sessionController';

const router = Router();
const sessionController = new SessionController();

// Start a new interview session
router.post('/start', sessionController.startSession);

// Update code snapshot during interview
router.put('/:sessionId/code', sessionController.updateCode);

// End interview session
router.post('/:sessionId/end', sessionController.endSession);

// Get interview results and evaluation
router.get('/:sessionId/results', sessionController.getResults);

export default router;

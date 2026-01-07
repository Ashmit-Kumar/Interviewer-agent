import { Router } from 'express';
import { livekitController } from '../controllers/livekitController';

const router = Router();

// Create LiveKit room and return token
router.post('/room', livekitController.createRoom.bind(livekitController));

// End LiveKit room
router.post('/room/:sessionId/end', livekitController.endRoom.bind(livekitController));

export default router;

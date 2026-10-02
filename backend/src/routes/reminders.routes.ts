import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  getReminderSuggestions, getReminders, getUpcomingDoses, patchReminder, postDose, postReminder, removeReminder,
} from '../controllers/reminders.controller';

// "My medicines" dose reminders — /api/v1/reminders (Sprint 33): the signed-in buyer's own, kept on the server
const router = Router();
router.use(authenticate);
router.get('/', getReminders);
router.get('/upcoming', getUpcomingDoses);
router.get('/suggestions', getReminderSuggestions);
router.post('/', postReminder);
router.patch('/:id', patchReminder);
router.delete('/:id', removeReminder);
router.post('/:id/doses', postDose);

export default router;

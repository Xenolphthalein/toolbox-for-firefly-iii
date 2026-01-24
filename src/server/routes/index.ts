import { Router } from 'express';
import { requireAuth } from '../middleware/index.js';
import authRoutes from './auth.js';
import statusRoutes from './status.js';
import duplicatesRoutes from './duplicates.js';
import subscriptionsRoutes from './subscriptions.js';
import suggestionsRoutes from './suggestions.js';
import amazonRoutes from './amazon.js';
import paypalRoutes from './paypal.js';
import transactionsRoutes from './transactions.js';
import converterRoutes from './converter.js';
import fintsRoutes from './fints.js';

const router = Router();

// Public routes (no auth required)
router.use('/auth', authRoutes);

// Semi-public routes (auth status info is available without auth)
router.use('/', statusRoutes);

// Protected routes (require authentication if auth is configured)
router.use('/duplicates', requireAuth, duplicatesRoutes);
router.use('/subscriptions', requireAuth, subscriptionsRoutes);
router.use('/suggestions', requireAuth, suggestionsRoutes);
router.use('/amazon', requireAuth, amazonRoutes);
router.use('/paypal', requireAuth, paypalRoutes);
router.use('/transactions', requireAuth, transactionsRoutes);
router.use('/converter', requireAuth, converterRoutes);
router.use('/fints', requireAuth, fintsRoutes);

export default router;

import { Router } from 'express';
import authRouter from './auth';
import clientsRouter from './clients';
import appsRouter from './apps';
import credentialsRouter from './credentials';
import templatesRouter from './templates';
import logsRouter from './logs';

const router = Router();

router.use('/auth', authRouter);
router.use('/clients', clientsRouter);
router.use('/apps', appsRouter);
router.use('/credentials', credentialsRouter);
router.use('/templates', templatesRouter);
router.use('/logs', logsRouter);

export default router;

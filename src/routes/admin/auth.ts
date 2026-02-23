import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AdminUser } from '../../models/AdminUser';
import { config } from '../../config';
import { validate } from '../../middleware/validate';
import { adminLoginSchema } from '../../validators/admin';
import { UnauthorizedError } from '../../utils/errors';
import { adminRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.use(adminRateLimiter);

/**
 * POST /api/admin/auth/login
 */
router.post(
  '/login',
  validate(adminLoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      const admin = await AdminUser.findOne({ email, isActive: true });
      if (!admin) throw new UnauthorizedError('Invalid credentials');

      const isValid = await admin.comparePassword(password);
      if (!isValid) throw new UnauthorizedError('Invalid credentials');

      const token = jwt.sign(
        { id: admin._id, email: admin.email, role: admin.role },
        config.admin.jwtSecret,
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        data: {
          token,
          admin: {
            id: admin._id,
            email: admin.email,
            role: admin.role,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

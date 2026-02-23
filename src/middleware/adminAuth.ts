import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errors';

export interface AdminRequest extends Request {
  adminId?: string;
  adminEmail?: string;
  adminRole?: string;
}

export async function adminAuth(
  req: AdminRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.admin.jwtSecret) as {
      id: string;
      email: string;
      role: string;
    };

    req.adminId = decoded.id;
    req.adminEmail = decoded.email;
    req.adminRole = decoded.role;

    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid or expired token'));
    } else {
      next(err);
    }
  }
}

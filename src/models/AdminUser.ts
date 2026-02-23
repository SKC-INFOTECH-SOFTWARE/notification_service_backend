import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IAdminUser extends Document {
  email: string;
  passwordHash: string;
  role: 'superadmin' | 'admin';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const AdminUserSchema = new Schema<IAdminUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['superadmin', 'admin'], default: 'admin' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AdminUserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

export const AdminUser = mongoose.model<IAdminUser>('AdminUser', AdminUserSchema);

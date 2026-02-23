import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IEmailBaseTemplate extends Document {
  clientId: Types.ObjectId;
  name: string;
  /**
   * Handlebars template for the full email layout.
   * Must contain {{{content}}} placeholder where event-specific body is injected.
   * Available variables: {{logoUrl}}, {{brandColor}}, {{companyName}}, {{footerText}}, {{{content}}}
   */
  htmlTemplate: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EmailBaseTemplateSchema = new Schema<IEmailBaseTemplate>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    htmlTemplate: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

EmailBaseTemplateSchema.index({ clientId: 1, isDefault: 1 });

export const EmailBaseTemplate = mongoose.model<IEmailBaseTemplate>(
  'EmailBaseTemplate',
  EmailBaseTemplateSchema
);

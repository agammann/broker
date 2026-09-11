import { z } from "zod";
export const id = z.uuid();
export const date = z.iso.date();
export const range = z
  .object({ from: date, to: date })
  .strict()
  .refine(
    (v) =>
      v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
    "Date range must be ordered and at most 366 days",
  );
export const requestSchema = z
  .object({
    account_id: id,
    requested_operation: z.literal("read_invoices"),
    reason: z.string().trim().min(1).max(500),
    idempotency_key: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[\w-]+$/),
  })
  .strict();
export const invoiceArgs = z
  .object({
    session_id: id,
    from: date,
    to: date,
    page: z.number().int().min(1).max(20).default(1),
    page_size: z.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine(
    (v) => range.safeParse({ from: v.from, to: v.to }).success,
    "Invalid date range",
  );
export const toolSchemas = {
  "broker.list_accounts": z.object({}).strict(),
  "broker.request_session": requestSchema,
  "broker.get_request": z.object({ request_id: id }).strict(),
  "broker.get_session": z.object({ session_id: id }).strict(),
  "broker.read_invoices": invoiceArgs,
  "broker.close_session": z.object({ session_id: id }).strict(),
};
export type ToolName = keyof typeof toolSchemas;
export const invoiceSchema = z
  .object({
    invoice_id: z.string().min(1).max(100),
    date,
    amount: z.string().regex(/^-?(0|[1-9]\d{0,14})\.\d{2}$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: z.enum(["paid", "open", "void", "overdue"]),
  })
  .strict();
export type Invoice = z.infer<typeof invoiceSchema>;
export const enrollment = z
  .object({
    label: z.string().trim().min(1).max(80),
    adapter: z.literal("test-portal"),
    username: z.string().min(1).max(200),
    password: z.string().min(1).max(1024),
    totp: z.string().min(16).max(2048),
  })
  .strict();
export const grantSchema = z
  .object({
    agent_id: id,
    account_id: id,
    adapter: z.literal("test-portal"),
    operation: z.literal("read_invoices"),
    starts: z.number().int().nonnegative(),
    expires: z.number().int().positive(),
    max_session_seconds: z.number().int().min(30).max(3600),
    rate: z.number().int().min(1).max(120),
    concurrency: z.number().int().min(1).max(3),
    approval_required: z.boolean(),
    from: date,
    to: date,
  })
  .strict()
  .refine(
    (v) =>
      v.starts < v.expires &&
      range.safeParse({ from: v.from, to: v.to }).success,
    "Invalid grant dates",
  );
export type GrantInput = z.infer<typeof grantSchema>;
export const passwordSchema = z.string().min(12).max(256);
export const settingsSchema = z
  .object({
    lock_seconds: z.number().int().min(60).max(86400),
    retention_days: z.number().int().min(1).max(365),
  })
  .strict();

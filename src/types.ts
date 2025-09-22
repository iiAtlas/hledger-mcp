import { z } from "zod";

// Date validation schema
export const DateSchema = z
  .string()
  .regex(
    /^\d{4}(-\d{2}(-\d{2})?)?$/,
    "Invalid date format. Use YYYY, YYYY-MM, or YYYY-MM-DD",
  );

// Period expressions for hledger
export const PeriodSchema = z.string().min(1);

// Account patterns (can include regex)
export const AccountPatternSchema = z.string().min(1);

// Output formats supported by hledger
export const OutputFormatSchema = z.enum([
  "txt",
  "csv",
  "tsv",
  "json",
  "html",
  "fods",
]);

// Report intervals
export const ReportIntervalSchema = z.enum([
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
]);

// File path schema with basic validation
export const FilePathSchema = z
  .string()
  .min(1)
  .refine((path) => {
    // Basic path validation - no null bytes, no traversal attempts
    return !path.includes("\0") && !path.includes("../") && path.length < 1000;
  }, "Invalid file path");

// Common hledger command options
export const CommonOptionsSchema = z.object({
  file: FilePathSchema.optional(),
  begin: DateSchema.nullish(),
  end: DateSchema.nullish(),
  period: PeriodSchema.nullish(),
  daily: z.boolean().optional(),
  weekly: z.boolean().optional(),
  monthly: z.boolean().optional(),
  quarterly: z.boolean().optional(),
  yearly: z.boolean().optional(),
  depth: z.number().int().min(1).max(10).optional(),
  real: z.boolean().optional(),
  empty: z.boolean().optional(),
  cost: z.boolean().optional(),
  market: z.boolean().optional(),
  exchange: z.string().optional(),
  cleared: z.boolean().optional(),
  pending: z.boolean().optional(),
  unmarked: z.boolean().optional(),
});

// Command execution result
export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  duration: number;
}

// Error types
export class HLedgerError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stderr: string,
    public readonly command: string,
  ) {
    super(message);
    this.name = "HLedgerError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

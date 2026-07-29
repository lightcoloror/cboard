/**
 * Custom error class for validation errors
 * Can be marked as a blocker to stop validation immediately
 */
export class ValidationError extends Error {
  constructor(message, blocker = false) {
    super(message);
    this.name = 'ValidationError';
    this.blocker = blocker;
  }
}
/**
 * Error wrapper that carries a structured ValidationResult so callers
 * can surface actionable details instead of generic exceptions.
 */
export class ValidationFailureError extends Error {
  constructor(message, validationResult, originalError) {
    super(message);
    this.name = 'ValidationFailureError';
    this.validationResult = validationResult;
    this.originalError = originalError;
  }
}
/**
 * Build a minimal ValidationResult for situations where we cannot run
 * the full validator (e.g., early parse failure) but still want
 * structured feedback for the caller.
 */
export function buildValidationResultFromMessage(params) {
  return {
    filename: params.filename,
    filesize: params.filesize,
    format: params.format,
    valid: false,
    errors: 1,
    warnings: 0,
    results: [
      {
        type: params.type || 'parse',
        description: params.description || 'parse',
        valid: false,
        error: params.message
      }
    ]
  };
}

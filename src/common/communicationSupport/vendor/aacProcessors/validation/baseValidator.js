import { defaultFileAdapter } from '../utils/io';
import { getZipAdapter } from '../utils/zip';
import { ValidationError } from './validationTypes';
/**
 * Base class for all format validators
 * Provides the check-based validation system
 */
export class BaseValidator {
  constructor(options = {}) {
    this._errors = 0;
    this._warnings = 0;
    this._checks = [];
    this._sub_checks = [];
    this._blocked = false;
    this._options = {
      includeWarnings: options.includeWarnings ?? true,
      stopOnBlocker: options.stopOnBlocker ?? true,
      customRules: options.customRules || [],
      fileAdapter: defaultFileAdapter,
      zipAdapter: getZipAdapter,
      ...options
    };
    this.reset();
  }
  /**
   * Reset validator state
   */
  reset() {
    this._errors = 0;
    this._warnings = 0;
    this._checks = [];
    this._sub_checks = [];
    this._blocked = false;
  }
  /**
   * Add a validation check that will be executed
   * @param type - Category of the check
   * @param description - Human-readable description
   * @param checkFn - Async function that performs the check
   */
  async add_check(type, description, checkFn) {
    // Skip if blocked by a previous error
    if (this._blocked && this._options.stopOnBlocker) {
      return;
    }
    const checkObj = {
      type,
      description,
      valid: true
    };
    this._checks.push(checkObj);
    try {
      await checkFn();
    } catch (e) {
      if (e instanceof ValidationError) {
        this._errors++;
        checkObj.valid = false;
        checkObj.error = e.message;
        if (e.blocker) {
          this._blocked = true;
        }
      } else {
        // Re-throw non-ValidationError exceptions
        throw e;
      }
    }
  }
  /**
   * Add a synchronous validation check
   */
  add_check_sync(type, description, checkFn) {
    // Convert sync to async for consistency
    // eslint-disable-next-line @typescript-eslint/require-await
    void this.add_check(type, description, async () => checkFn());
  }
  /**
   * Throw a validation error
   * @param message - Error message
   * @param blocker - If true, stop further validation
   */
  err(message, blocker = false) {
    throw new ValidationError(message, blocker);
  }
  /**
   * Add a warning to the last check
   * @param message - Warning message
   */
  warn(message) {
    if (!this._options.includeWarnings) {
      return;
    }
    this._warnings++;
    const lastCheck = this._checks[this._checks.length - 1];
    if (lastCheck) {
      lastCheck.warnings = lastCheck.warnings || [];
      lastCheck.warnings.push(message);
    }
  }
  /**
   * Get the current error count
   */
  get errors() {
    return this._errors;
  }
  /**
   * Get the current warning count
   */
  get warnings() {
    return this._warnings;
  }
  /**
   * Get all checks performed so far
   */
  get checks() {
    return this._checks;
  }
  /**
   * Get sub-validation results
   */
  get sub_checks() {
    return this._sub_checks;
  }
  /**
   * Check if validation has been blocked
   */
  get isBlocked() {
    return this._blocked;
  }
  /**
   * Build the final validation result
   */
  buildResult(filename, filesize, format) {
    return {
      filename,
      filesize,
      format,
      valid: this._errors === 0,
      errors: this._errors,
      warnings: this._warnings,
      results: this._checks,
      sub_results: this._sub_checks.length > 0 ? this._sub_checks : undefined
    };
  }
  /**
   * Static helper to validate from file path
   * Must be implemented by subclasses if they support file-based validation
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  static async validateFile(_filePath) {
    throw new Error('validateFile must be implemented by subclass');
  }
  /**
   * Static helper to identify if content is this validator's format
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  static async identifyFormat(_content, _filename) {
    throw new Error('identifyFormat must be implemented by subclass');
  }
}

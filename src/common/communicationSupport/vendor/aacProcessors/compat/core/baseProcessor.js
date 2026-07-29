/**
 * Base Processor for AAC File Formats
 *
 * This module provides base functionality for processing AAC (Augmentative and Alternative
 * Communication) files across various formats (gridset, OBF, Snap, TouchChat, etc.).
 *
 * ## LLM-Based Translation with Symbol Preservation
 *
 * All processor formats support LLM-based translation that preserves symbol-to-word
 * associations across languages. This is critical for AAC systems where visual symbols
 * are attached to specific words.
 *
 * ### Usage Example:
 *
 * ```typescript
 * import { extractAllButtonsForTranslation, createTranslationPrompt } from '../optional/translation/translationProcessor';
 *
 * // 1. Extract buttons from your format
 * const buttons = extractAllButtonsForTranslation(myFormatButtons, (button) => ({
 *   pageId: button.pageId,
 *   pageName: button.pageName
 * }));
 *
 * // 2. Create prompt for LLM
 * const prompt = createTranslationPrompt(buttons, 'Spanish');
 *
 * // 3. Send to LLM (Gemini, GPT, etc.) and get response
 * const llmResponse = await callLLMAPI(prompt);
 *
 * // 4. Apply translations to your format
 * processor.processLLMTranslations(filePath, llmResponse, outputPath);
 * ```
 *
 * ### Format-Specific Implementation:
 *
 * Each processor should implement:
 * - `extractSymbolsForLLM()` - Uses extractAllButtonsForTranslation() utility
 * - `processLLMTranslations()` - Applies translations using format-specific logic
 *
 * See `src/utilities/translation/translationProcessor.ts` for shared utilities.
 */
import { AACSemanticCategory } from './treeStructure';
import { detectCasing, isNumericOrEmpty } from './stringCasing';
import { defaultFileAdapter } from '../utils/io';
class BaseProcessor {
  constructor(options = {}) {
    // Default configuration: exclude navigation/system buttons
    this.options = {
      excludeNavigationButtons: true,
      excludeSystemButtons: true,
      preserveAllButtons: false,
      fileAdapter: defaultFileAdapter,
      ...options
    };
  }
  // Helper method to determine if a button should be filtered out
  shouldFilterButton(button) {
    // If preserveAllButtons is true, never filter
    if (this.options.preserveAllButtons) {
      return false;
    }
    // Apply custom filter if provided
    if (this.options.customButtonFilter) {
      return !this.options.customButtonFilter(button);
    }
    // Check semantic action-based filtering
    if (button.semanticAction) {
      const { category, intent } = button.semanticAction;
      // Filter specific navigation intents (toolbar navigation only)
      if (this.options.excludeNavigationButtons) {
        const i = String(intent);
        if (i === 'GO_BACK' || i === 'GO_HOME') {
          return true;
        }
      }
      // Filter system/text editing buttons by category
      if (
        this.options.excludeSystemButtons &&
        category === AACSemanticCategory.TEXT_EDITING
      ) {
        return true;
      }
      // Filter specific system intents
      if (this.options.excludeSystemButtons) {
        const i = String(intent);
        if (
          i === 'DELETE_WORD' ||
          i === 'DELETE_CHARACTER' ||
          i === 'CLEAR_TEXT' ||
          i === 'COPY_TEXT'
        ) {
          return true;
        }
      }
    }
    // Fallback: check button labels for common navigation/system terms
    // Only apply label-based filtering if button doesn't have semantic actions
    if (
      !button.semanticAction &&
      (this.options.excludeNavigationButtons ||
        this.options.excludeSystemButtons)
    ) {
      var _button$label, _button$message;
      const label =
        ((_button$label = button.label) === null || _button$label === void 0
          ? void 0
          : _button$label.toLowerCase()) || '';
      const message =
        ((_button$message = button.message) === null ||
        _button$message === void 0
          ? void 0
          : _button$message.toLowerCase()) || '';
      // More conservative navigation terms (exclude "more" since it's often used for legitimate page navigation)
      const navigationTerms = ['back', 'home', 'menu', 'settings'];
      const systemTerms = ['delete', 'clear', 'copy', 'paste', 'undo', 'redo'];
      if (
        this.options.excludeNavigationButtons &&
        navigationTerms.some(
          term => label.includes(term) || message.includes(term)
        )
      ) {
        return true;
      }
      if (
        this.options.excludeSystemButtons &&
        systemTerms.some(term => label.includes(term) || message.includes(term))
      ) {
        return true;
      }
    }
    return false;
  }
  // Helper method to filter buttons from a page
  filterPageButtons(buttons) {
    return buttons.filter(button => !this.shouldFilterButton(button));
  }
  /**
   * Generic implementation for extracting strings with metadata
   * Can be used by any processor that doesn't need format-specific logic
   * @param filePath - Path to the AAC file
   * @returns Promise with extracted strings and metadata
   */
  async extractStringsWithMetadataGeneric(filePath) {
    try {
      const tree = await this.loadIntoTree(filePath);
      const extractedMap = new Map();
      // Process all pages and buttons
      Object.values(tree.pages).forEach(page => {
        // Process page names
        if (
          page.name &&
          page.name.trim().length > 1 &&
          !isNumericOrEmpty(page.name)
        ) {
          const key = page.name.trim().toLowerCase();
          const vocabLocation = {
            table: 'pages',
            id: page.id,
            column: 'NAME',
            casing: detectCasing(page.name)
          };
          this.addToExtractedMap(
            extractedMap,
            key,
            page.name.trim(),
            vocabLocation
          );
        }
        page.buttons.forEach(button => {
          // Process button labels
          if (
            button.label &&
            button.label.trim().length > 1 &&
            !isNumericOrEmpty(button.label)
          ) {
            const key = button.label.trim().toLowerCase();
            const vocabLocation = {
              table: 'buttons',
              id: button.id,
              column: 'LABEL',
              casing: detectCasing(button.label)
            };
            this.addToExtractedMap(
              extractedMap,
              key,
              button.label.trim(),
              vocabLocation
            );
          }
          // Process button messages (if different from label)
          if (
            button.message &&
            button.message !== button.label &&
            button.message.trim().length > 1 &&
            !isNumericOrEmpty(button.message)
          ) {
            const key = button.message.trim().toLowerCase();
            const vocabLocation = {
              table: 'buttons',
              id: button.id,
              column: 'MESSAGE',
              casing: detectCasing(button.message)
            };
            this.addToExtractedMap(
              extractedMap,
              key,
              button.message.trim(),
              vocabLocation
            );
          }
        });
      });
      const extractedStrings = Array.from(extractedMap.values());
      return {
        errors: [],
        extractedStrings
      };
    } catch (error) {
      return {
        errors: [
          {
            message:
              error instanceof Error
                ? error.message
                : 'Unknown extraction error',
            step: 'EXTRACT'
          }
        ],
        extractedStrings: []
      };
    }
  }
  /**
   * Generic implementation for generating translated downloads
   * Can be used by any processor that doesn't need format-specific logic
   * @param filePath - Path to the original AAC file
   * @param translatedStrings - Array of translated string data
   * @param sourceStrings - Array of source string data
   * @returns Promise with path to the generated translated file
   */
  async generateTranslatedDownloadGeneric(
    filePath,
    translatedStrings,
    sourceStrings
  ) {
    // Build translation map from the provided data
    const translations = new Map();
    sourceStrings.forEach(sourceString => {
      const translated = translatedStrings.find(
        ts => ts.sourcestringid.toString() === sourceString.id.toString()
      );
      if (translated) {
        const translatedText =
          translated.overridestring.length > 0
            ? translated.overridestring
            : translated.translatedstring;
        translations.set(sourceString.sourcestring, translatedText);
      }
    });
    // Generate output path based on file extension
    const outputPath = this.generateTranslatedOutputPath(filePath);
    // Use existing processTexts method (now async)
    await this.processTexts(filePath, translations, outputPath);
    return outputPath;
  }
  /**
   * Helper method to add extracted strings to the map, handling duplicates
   * @param extractedMap - Map to store extracted strings
   * @param key - Lowercase key for deduplication
   * @param originalString - Original string with proper casing
   * @param vocabLocation - Metadata about where the string was found
   */
  addToExtractedMap(extractedMap, key, originalString, vocabLocation) {
    const existing = extractedMap.get(key);
    if (existing) {
      existing.vocabPlacementMeta.vocabLocations.push(vocabLocation);
    } else {
      extractedMap.set(key, {
        string: originalString,
        // Use original casing for the string value
        vocabPlacementMeta: {
          vocabLocations: [vocabLocation]
        }
      });
    }
  }
  /**
   * Generate output path for translated file based on input file extension
   * @param filePath - Original file path
   * @returns Path for the translated output file
   */
  generateTranslatedOutputPath(filePath) {
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return filePath + '_translated';
    }
    const basePath = filePath.substring(0, lastDotIndex);
    const extension = filePath.substring(lastDotIndex);
    return `${basePath}_translated${extension}`;
  }
}
export { BaseProcessor };

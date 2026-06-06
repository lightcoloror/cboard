# TuYuJia Upstream Prep Notes

This note organizes the current TuYuJia-related work into local-only buckets.
Nothing in this document implies a commit, PR, or upstream submission yet.

## Goal

Prepare the current fork for a future upstream strategy without submitting
anything now.

Use this document to answer:

- Which changes are upstream-ready today
- Which changes should be refactored before any PR
- Which changes should stay in the TuYuJia fork
- How to split future PRs into small, reviewable units

## Current Implementation Baseline

The current local branch now has the main feature slices separated into commits:

- `1eb1f12d feat: add communication support flow`
- `ae9ad1fe feat: add tile matching hints`
- `30e91ea3 feat: add tuyujia compatibility wrappers`

The current local `cboard-api` branch adds:

- `5e035fa feat: add communication support settings fields`

These are the baseline commits for the next upstream preparation pass.

## Current Local Change Inventory

### Frontend

- `craco.config.js`
- `src/common/communicationSupport/*`
- `src/components/Board/CommunicationSupport/*`
- `src/components/Board/Board.component.js`
- `src/components/Board/Board.css`
- `src/components/Board/TileEditor/TileEditor.component.js`
- `src/components/Board/TileEditor/TileEditor.messages.js`
- `src/components/Board/Tuyujia/*`
- `src/components/Settings/Settings.component.js`
- `src/components/Settings/Settings.messages.js`
- `src/components/Settings/Settings.wrapper.js`
- `src/components/Settings/Tuyujia/*`

### Backend

- `../cboard-api/api/models/Settings.js`

### Environment / package files

- `yarn.lock`
- `package-lock.json`

These should be treated carefully and usually excluded from upstream-focused
feature PRs unless they are required by the exact change being proposed.

## Bucket A: Upstream-ready today

These changes are useful to Cboard in general and do not depend on TuYuJia as
a branded product.

### A1. Windows production build fix

Files:

- `craco.config.js`

Why it fits upstream:

- Fixes a real build problem on Windows
- Does not change product behavior
- Already validated with `npm run build`

Recommended future PR title:

- `build: fix Windows production build spawn EPERM`

### A2. Tile-level matching metadata

Files:

- `src/components/Board/TileEditor/TileEditor.component.js`
- `src/components/Board/TileEditor/TileEditor.messages.js`

What it adds:

- Optional synonym hints
- Optional exclusion hints
- Optional semantic category hints

Why it fits upstream:

- The fields are generic matching metadata
- They improve symbol lookup and future text-to-symbol workflows
- They do not require TuYuJia UI to exist

What should change before PR:

- Rename field labels from TuYuJia-specific language to neutral matching terms
- Consider more neutral internal keys in a follow-up if upstream prefers that

Recommended future PR title:

- `feat: add tile matching hint fields`

## Bucket B: Valuable, but refactor before any PR

These changes contain good reusable logic, but the current structure is too
TuYuJia-specific or too product-shaped for direct upstream submission.

### B1. Text-to-symbol matching utilities

Files:

- `src/common/communicationSupport/symbolMatching.js`
- `src/common/communicationSupport/segmentation.js`
- `src/common/communicationSupport/chineseLexicon.js`

Why it is promising:

- Reuses existing Cboard board/tile data
- Supports labelKey/nameKey-aware matching
- Includes safety guards for ambiguous matches

Why it is not ready yet:

- Lexicon is Chinese and care-scenario-oriented
- Exposed concepts are not yet framed as a general Cboard feature

Refactor needed first:

- Separate generic matcher from locale-specific lexicon data
- Keep the matcher generic and make lexicon injection configurable

Recommended future PR title:

- `feat: add text-to-symbol matching utilities`

### B2. Phrase suggestion and communication history utilities

Files:

- `src/common/communicationSupport/phraseSuggestions.js`
- `src/common/communicationSupport/storage.js`
- `src/common/communicationSupport/browserSpeech.js`
- `src/common/communicationSupport/settingsAdapter.js`
- `src/components/Board/Tuyujia/__tests__/localData.test.js`
- `src/components/Board/Tuyujia/__tests__/templateNlg.test.js`

Why it is promising:

- Candidate phrase generation is broadly useful
- Saved phrases and communication history are generally reusable
- Web Speech input can support accessibility scenarios beyond TuYuJia

Why it is not ready yet:

- Naming and storage keys are TuYuJia-specific
- Settings payload is currently stored under `tuyujia`
- The current UX assumptions are tied to the TuYuJia workflow

Refactor needed first:

- Rename persistence keys and structures to neutral communication terms
- Split speech input hook from receiver-specific UI
- Define a generic settings subtree name before any backend PR

Recommended future PR titles:

- `feat: add communication history utilities`
- `feat: add browser speech input helper`

### B3. Backend settings extension

Files:

- `../cboard-api/api/models/Settings.js`

Why it is promising:

- Cboard may need a persistent place for communication-support settings

Why it is not ready yet:

- `tuyujia` is not an upstream-friendly schema key

Refactor needed first:

- Decide on a neutral key such as `communicationSupport`,
  `messageSupport`, or `symbolAssist`

Current local status:

- Frontend adapter already prefers `communicationSupport`
- Backend schema now includes `communicationSupport`
- `tuyujia` remains only as a compatibility key

Recommended future PR title:

- `feat(api): add communication support settings bucket`

## Bucket C: Keep in the fork for now

These changes are part of the TuYuJia product layer and should stay local
until there is a clear upstream feature proposal.

### C1. Embedded TuYuJia board panel

Files:

- `src/components/Board/Board.component.js`
- `src/components/Board/Board.css`
- `src/components/Board/Tuyujia/TuyujiaPanel.component.js`
- `src/components/Board/Tuyujia/TuyujiaPanel.container.js`
- `src/components/Board/Tuyujia/index.js`

Why it should stay local:

- It changes the main board UI directly
- It introduces TuYuJia branding and workflow assumptions
- It is a product feature, not just an enabling capability

Related upstream candidate extracted from it:

- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.component.js`
- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.container.js`
- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.css`
- `src/components/Board/CommunicationSupport/CommunicationSupportFeature.component.js`

### C2. TuYuJia settings entry and page

Files:

- `src/components/Settings/Settings.component.js`
- `src/components/Settings/Settings.messages.js`
- `src/components/Settings/Settings.wrapper.js`
- `src/components/Settings/Tuyujia/*`

Why it should stay local:

- It exposes product-specific navigation and terminology
- The page is useful for the fork but too specialized for upstream today

Related upstream candidate extracted from it:

- `src/components/Settings/CommunicationSupport/CommunicationSupport.component.js`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.container.js`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.css`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.messages.js`

## Current Core vs Compatibility Mapping

This is the current boundary after the refactor work.

### Neutral core modules

- `src/common/communicationSupport/storage.js`
- `src/common/communicationSupport/localData.js`
- `src/common/communicationSupport/settingsAdapter.js`
- `src/common/communicationSupport/tileMetadata.js`
- `src/common/communicationSupport/symbolMatching.js`
- `src/common/communicationSupport/segmentation.js`
- `src/common/communicationSupport/phraseSuggestions.js`
- `src/common/communicationSupport/browserSpeech.js`
- `src/components/Board/CommunicationSupport/*`
- `src/components/Settings/CommunicationSupport/*`

### Compatibility / branding layer

- `src/common/communicationSupport/legacy.js`

## Next PR Sequence

This is the current recommended sequence for reviewable pull requests.

### PR A: Communication support flow

Repository:

- `cboard`

Base commit scope:

- `1eb1f12d feat: add communication support flow`

Intent:

- Add the neutral `CommunicationSupport` board flow
- Add the neutral settings entry and settings management page
- Persist saved phrases and receiver history through the existing settings API
- Keep the feature independent from TuYuJia branding

Recommended title:

- `feat: add communication support flow`

Recommended description points:

- Adds a neutral communication support panel to the board experience
- Adds a settings page for sync, import/export, and local cleanup
- Reuses existing `/settings` persistence instead of introducing new endpoints
- Includes receiver workflow tests, settings tests, and build verification

Explicitly exclude:

- `TileEditor` matching metadata fields
- `Tuyujia` wrappers
- `craco.config.js`
- `yarn.lock`
- `package-lock.json`

### PR B: Tile matching hints

Repository:

- `cboard`

Base commit scope:

- `ae9ad1fe feat: add tile matching hints`

Intent:

- Add optional tile-level matching metadata to improve receiver-side matching
- Keep the change editor-scoped and independent from the full communication UI

Recommended title:

- `feat: add tile matching hints`

Recommended description points:

- Adds optional synonym, exclusion, and category fields in `TileEditor`
- Stores metadata through the neutral communication tile metadata adapter
- Improves future text-to-symbol workflows without requiring TuYuJia UI

Explicitly exclude:

- `CommunicationSupport` board/settings flow
- `Tuyujia` wrappers
- `craco.config.js`
- `yarn.lock`
- `package-lock.json`

### PR C: Settings schema compatibility

Repository:

- `cboard-api`

Base commit scope:

- `5e035fa feat: add communication support settings fields`

Intent:

- Extend the existing settings schema so the frontend can persist
  `communicationSupport` while still reading legacy `tuyujia`

Recommended title:

- `feat(api): add communication support settings fields`

Recommended description points:

- Adds `communicationSupport` and legacy `tuyujia` buckets to the settings model
- Keeps compatibility with the frontend adapter strategy
- Uses the existing settings controller and route shape

Explicitly exclude:

- lockfile changes

### Fork-only follow-up

Repository:

- `cboard`

Base commit scope:

- `30e91ea3 feat: add tuyujia compatibility wrappers`

Intent:

- Preserve branded `TuYuJia` wrappers and compatibility entrypoints in the fork
- Do not submit this as the first upstream wave
- `src/components/Board/Tuyujia/TuyujiaPanel.component.js`
- `src/components/Board/Tuyujia/TuyujiaPanel.container.js`
- `src/components/Board/Tuyujia/localData.js`
- `src/components/Board/Tuyujia/matcher.js`
- `src/components/Board/Tuyujia/segmentText.js`
- `src/components/Board/Tuyujia/templateNlg.js`
- `src/components/Board/Tuyujia/tuyujia-lexicon.js`
- `src/components/Board/Tuyujia/useWebSpeech.js`
- `src/components/Settings/Tuyujia/*`

### Compatibility wrapper verification

These tests now explicitly verify that the TuYuJia layer is mainly a forwarding
layer on top of neutral communication-support code.

- `src/components/Board/Tuyujia/TuyujiaPanel.component.test.js`
- `src/components/Board/Tuyujia/index.test.js`
- `src/components/Settings/Tuyujia/Tuyujia.component.test.js`
- `src/components/Settings/Tuyujia/index.test.js`

What they verify:

- The branded board panel renders the neutral communication support panel
- Branded copy is injected through `copyOverrides`
- The board and settings `index.js` entrypoints still re-export the legacy
  compatibility containers

### Remaining intentional legacy hooks

- Settings schema fallback key: `tuyujia`
- Tile metadata fallback keys: `tuyujiaSynonyms`, `tuyujiaExcludeTokens`, `tuyujiaCategory`
- Local storage fallback keys: `cboard_tuyujia_saved_phrases`, `cboard_tuyujia_history`
- Branded feature variant: `COMMUNICATION_SUPPORT_VARIANTS.tuyujia`
- Branded settings route: `COMMUNICATION_SUPPORT_ROUTE_SEGMENTS.tuyujia`

### C3. Chinese care-oriented lexicon defaults

Files:

- `src/components/Board/Tuyujia/tuyujia-lexicon.js`

Why it should stay local:

- The current vocabulary reflects TuYuJia's Chinese communication use cases
- Upstream would likely want locale-packaged or optional data instead

## Proposed Future PR Stack

Do not submit yet. This is only the preferred future split.

1. `build: fix Windows production build spawn EPERM`
2. `feat: add tile matching hint fields`
3. `refactor: extract neutral text-to-symbol matching utilities`
4. `feat(api): add neutral communication support settings bucket`
5. Optional later: a generic upstream feature built on those primitives

### Stronger functional alternative to PR 2

If upstream needs a PR that proves real user-facing value more clearly than
"matching hint fields", the stronger candidate is a receiver-side closed loop:

- text input
- text-to-symbol matching
- review / reorder / replace
- send to output bar
- receive history capture after send

Why it is stronger:

- It demonstrates an end-to-end communication-support workflow
- It gives the metadata and matching utilities an immediate consumer story
- It is much easier to explain as a user-facing feature than standalone fields

Main tradeoff:

- It is a larger PR than the tile metadata-only option
- It needs a careful neutral framing so it reads as a generic Cboard feature,
  not as a TuYuJia-only product surface

## PR 1/2/3 Rehearsal

This section is the more concrete rehearsal version of the future split.
The intent is to make it obvious which files belong together and which files
should stay out of scope for each draft PR.

### PR 1. Build fix only

Suggested title:

- `build: fix Windows production build spawn EPERM`

Include:

- `craco.config.js`

Do not include:

- Any `src/common/communicationSupport/*`
- Any `src/components/Board/*`
- Any `src/components/Settings/*`
- `../cboard-api/api/models/Settings.js`
- `yarn.lock`
- `package-lock.json`

Verification:

- `npm run build`

### PR 2. Tile matching metadata only

Suggested title:

- `feat: add tile matching hint fields`

Core story this PR must tell:

- This PR is not about adding arbitrary TuYuJia fields
- This PR adds optional tile-level matching hints that improve future
  text-to-symbol lookup quality
- The fields are intended to support safer disambiguation and better symbol
  retrieval without changing existing board behavior

Primary include:

- `src/components/Board/TileEditor/TileEditor.component.js`
- `src/components/Board/TileEditor/TileEditor.messages.js`
- `src/common/communicationSupport/tileMetadata.js`
- `src/common/communicationSupport/tileMetadata.test.js`

Possible include depending on how strictly upstream wants neutral boundaries:

- `src/common/communicationSupport/legacy.js`

Why this may need a choice:

- The tile metadata adapter currently mirrors neutral keys into legacy
  TuYuJia keys
- If upstream wants no legacy compatibility in PR 2, split the mirroring out
  before sending

How to explain each field to reviewers:

- `Matching synonyms`
  - lets a tile declare additional phrases that should resolve to it during
    future matching flows
  - example: a rest tile may want to match phrases like `rest a bit`
- `Exclude tokens`
  - lets a tile opt out of ambiguous tokens that would otherwise create bad
    matches
  - example: avoid mapping a short shared token to the wrong symbol
- `Semantic category`
  - lets a tile provide an optional domain hint for future ranking and
    disambiguation
  - example: prioritize a medical interpretation over a generic object when
    both share nearby vocabulary

Do not include:

- `src/common/communicationSupport/symbolMatching.js`
- `src/common/communicationSupport/settingsAdapter.js`
- `src/common/communicationSupport/localData.js`
- `src/components/Board/CommunicationSupport/*`
- `src/components/Board/Tuyujia/*`
- `src/components/Settings/*`
- `../cboard-api/api/models/Settings.js`

Verification:

- `src/components/Board/TileEditor/TileEditor.test.js`
- `src/common/communicationSupport/tileMetadata.test.js`

### PR 3. Neutral text-to-symbol core only

Suggested title:

- `refactor: extract neutral text-to-symbol matching utilities`

Primary include:

- `src/common/communicationSupport/symbolMatching.js`
- `src/common/communicationSupport/segmentation.js`
- `src/common/communicationSupport/chineseLexicon.js`
- `src/common/communicationSupport/phraseSuggestions.js`
- `src/common/communicationSupport/browserSpeech.js`
- `src/common/communicationSupport/storage.js`
- `src/common/communicationSupport/localData.js`
- `src/common/communicationSupport/settingsAdapter.js`
- `src/common/communicationSupport/legacy.js`
- `src/common/communicationSupport/localData.test.js`
- `src/common/communicationSupport/settingsAdapter.test.js`
- `src/common/communicationSupport/tileMetadata.test.js`

Only include if upstream is ready for a generic UI surface in the same PR:

- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.component.js`
- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.container.js`
- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.css`
- `src/components/Board/CommunicationSupport/CommunicationSupportFeature.component.js`
- `src/components/Board/CommunicationSupport/index.js`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.component.js`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.container.js`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.css`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.messages.js`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.component.test.js`
- `src/components/Settings/CommunicationSupport/__snapshots__/CommunicationSupport.component.test.js.snap`
- `src/components/Settings/CommunicationSupport/index.js`

Recommended split inside PR 3 if the above feels too large:

1. Core utilities only:
   - everything under `src/common/communicationSupport/*`
2. Generic UI follow-up:
   - everything under `src/components/Board/CommunicationSupport/*`
   - everything under `src/components/Settings/CommunicationSupport/*`

Do not include:

- `src/components/Board/Tuyujia/*`
- `src/components/Settings/Tuyujia/*`
- `src/components/Board/Board.component.js`
- `src/components/Board/Board.css`
- `src/components/Settings/Settings.component.js`
- `src/components/Settings/Settings.messages.js`
- `src/components/Settings/Settings.wrapper.js`
- `../cboard-api/api/models/Settings.js`

Verification:

- `src/common/communicationSupport/localData.test.js`
- `src/common/communicationSupport/settingsAdapter.test.js`
- `src/common/communicationSupport/tileMetadata.test.js`
- `src/components/Board/Tuyujia/__tests__/matcher.test.js`
- `src/components/Board/Tuyujia/__tests__/templateNlg.test.js`
- `src/components/Board/Tuyujia/__tests__/localData.test.js`
- `src/components/Board/__tests__/Board.component.test.js`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.component.test.js`

### Files intentionally deferred past PR 3

These should remain local even after the first three upstream-oriented PRs are
prepared:

- `src/components/Board/Tuyujia/TuyujiaPanel.component.js`
- `src/components/Board/Tuyujia/TuyujiaPanel.container.js`
- `src/components/Board/Tuyujia/TuyujiaPanel.css`
- `src/components/Board/Tuyujia/index.js`
- `src/components/Board/Tuyujia/index.test.js`
- `src/components/Board/Tuyujia/TuyujiaPanel.component.test.js`
- `src/components/Board/Tuyujia/localData.js`
- `src/components/Board/Tuyujia/matcher.js`
- `src/components/Board/Tuyujia/segmentText.js`
- `src/components/Board/Tuyujia/templateNlg.js`
- `src/components/Board/Tuyujia/tuyujia-lexicon.js`
- `src/components/Board/Tuyujia/useWebSpeech.js`
- `src/components/Settings/Tuyujia/*`
- `src/components/Board/Board.component.js`
- `src/components/Board/Board.css`
- `src/components/Settings/Settings.component.js`
- `src/components/Settings/Settings.messages.js`
- `src/components/Settings/Settings.wrapper.js`

## Staging Checklist Drafts

This section assumes a future manual staging flow. It is still local-only and
should be treated as rehearsal notes, not as instructions to submit now.

### Draft staging for PR 2

Goal:

- Stage only the tile matching metadata work

Stage first:

- `src/components/Board/TileEditor/TileEditor.component.js`
- `src/components/Board/TileEditor/TileEditor.messages.js`
- `src/common/communicationSupport/tileMetadata.js`
- `src/common/communicationSupport/tileMetadata.test.js`

Stage only if needed for compatibility strategy:

- `src/common/communicationSupport/legacy.js`

Re-check before staging:

- Confirm `src/common/communicationSupport/legacy.js` is not also carrying
  unrelated route or branding changes you do not want in PR 2
- Confirm `TileEditor.component.js` does not drag in neutral communication
  support UI imports by accident

Do not stage:

- `src/common/communicationSupport/localData.js`
- `src/common/communicationSupport/settingsAdapter.js`
- `src/common/communicationSupport/symbolMatching.js`
- `src/components/Board/CommunicationSupport/*`
- `src/components/Board/Tuyujia/*`
- `src/components/Settings/*`
- `../cboard-api/api/models/Settings.js`
- `yarn.lock`
- `package-lock.json`

Suggested verification before commit:

- `src/common/communicationSupport/tileMetadata.test.js`
- `src/components/Board/TileEditor/TileEditor.test.js`

Manual review points:

- Check that field labels are neutral enough for upstream reviewers
- Check whether mirrored legacy keys should stay in this PR or move to fork-only
- If this rationale still feels too speculative, do not send PR 2 first
- In that case, wait until a small generic consumer of these fields can be
  included or demonstrated separately

### Draft staging for PR 3A

Goal:

- Stage only the neutral communication-support core utilities

Stage first:

- `src/common/communicationSupport/browserSpeech.js`
- `src/common/communicationSupport/chineseLexicon.js`
- `src/common/communicationSupport/legacy.js`
- `src/common/communicationSupport/localData.js`
- `src/common/communicationSupport/localData.test.js`
- `src/common/communicationSupport/phraseSuggestions.js`
- `src/common/communicationSupport/segmentation.js`
- `src/common/communicationSupport/settingsAdapter.js`
- `src/common/communicationSupport/settingsAdapter.test.js`
- `src/common/communicationSupport/storage.js`
- `src/common/communicationSupport/symbolMatching.js`

Stage only if not already used in PR 2:

- `src/common/communicationSupport/tileMetadata.js`
- `src/common/communicationSupport/tileMetadata.test.js`

Compatibility tests allowed in this draft:

- `src/components/Board/Tuyujia/__tests__/matcher.test.js`
- `src/components/Board/Tuyujia/__tests__/templateNlg.test.js`
- `src/components/Board/Tuyujia/__tests__/localData.test.js`

Why these are acceptable:

- They validate the generic logic through the old compatibility exports
- They are useful as migration safety tests even if they are not ideal

Do not stage:

- `src/components/Board/CommunicationSupport/*`
- `src/components/Settings/CommunicationSupport/*`
- `src/components/Board/Tuyujia/TuyujiaPanel.component.js`
- `src/components/Board/Tuyujia/TuyujiaPanel.container.js`
- `src/components/Board/Tuyujia/TuyujiaPanel.css`
- `src/components/Settings/Tuyujia/*`
- `src/components/Board/Board.component.js`
- `src/components/Board/Board.css`
- `src/components/Settings/Settings.component.js`
- `src/components/Settings/Settings.messages.js`
- `src/components/Settings/Settings.wrapper.js`
- `../cboard-api/api/models/Settings.js`

Suggested verification before commit:

- `src/common/communicationSupport/localData.test.js`
- `src/common/communicationSupport/settingsAdapter.test.js`
- `src/common/communicationSupport/tileMetadata.test.js`
- `src/components/Board/Tuyujia/__tests__/matcher.test.js`
- `src/components/Board/Tuyujia/__tests__/templateNlg.test.js`
- `src/components/Board/Tuyujia/__tests__/localData.test.js`

Manual review points:

- Decide whether `chineseLexicon.js` should be included or replaced with a more
  generic injectable locale data story first
- Decide whether `legacy.js` belongs in upstream or should be fork-only

### Draft staging for PR 3B

Goal:

- Stage only the generic communication-support UI after PR 3A

Stage:

- `src/components/Board/CommunicationSupport/CommunicationSupportFeature.component.js`
- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.component.js`
- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.container.js`
- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.css`
- `src/components/Board/CommunicationSupport/index.js`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.component.js`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.component.test.js`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.container.js`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.css`
- `src/components/Settings/CommunicationSupport/CommunicationSupport.messages.js`
- `src/components/Settings/CommunicationSupport/index.js`
- `src/components/Settings/CommunicationSupport/__snapshots__/CommunicationSupport.component.test.js.snap`

Do not stage:

- `src/components/Board/Tuyujia/*`
- `src/components/Settings/Tuyujia/*`
- `src/components/Board/Board.component.js`
- `src/components/Board/Board.css`
- `src/components/Settings/Settings.component.js`
- `src/components/Settings/Settings.messages.js`
- `src/components/Settings/Settings.wrapper.js`

Suggested verification before commit:

- `src/components/Settings/CommunicationSupport/CommunicationSupport.component.test.js`

Optional broader safety check:

- `src/components/Board/__tests__/Board.component.test.js`

Manual review points:

- Decide whether upstream is ready for a generic communication-support panel at
  all, or whether PR 3 should stop at core utilities
- Check if Board and Settings entrypoints can remain entirely out of scope

### Draft staging for PR 4 receiver loop

Goal:

- Stage the smallest user-facing receiver workflow that proves the core
  text-to-symbol loop

Stage:

- `src/common/communicationSupport/receiverPipeline.js`
- `src/common/communicationSupport/symbolMatching.js`
- `src/common/communicationSupport/segmentation.js`
- `src/common/communicationSupport/chineseLexicon.js`
- `src/common/communicationSupport/tileMetadata.js`
- `src/common/communicationSupport/legacy.js`
- `src/components/Board/CommunicationSupport/ReceiverLoopPanel.component.js`
- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.css`
- `src/common/communicationSupport/receiverPipeline.test.js`
- `src/components/Board/CommunicationSupport/ReceiverLoopPanel.component.test.js`

Stage only if upstream accepts a visible entrypoint in the same PR:

- `src/components/Board/CommunicationSupport/CommunicationSupportFeature.component.js`
- `src/components/Board/CommunicationSupport/index.js`
- `src/components/Board/Board.component.js`
- `src/components/Board/Board.css`

Why this split matters:

- The panel itself proves the receiver loop
- Board embedding is a separate product decision and may be too much for the
  first upstream discussion

Do not stage:

- `src/components/Board/Tuyujia/*`
- `src/components/Settings/*`
- `src/common/communicationSupport/localData.js`
- `src/common/communicationSupport/settingsAdapter.js`
- `src/common/communicationSupport/browserSpeech.js`
- `src/components/Settings/CommunicationSupport/*`
- `../cboard-api/api/models/Settings.js`

Suggested verification before commit:

- `src/common/communicationSupport/receiverPipeline.test.js`
- `src/components/Board/CommunicationSupport/ReceiverLoopPanel.component.test.js`
- `src/components/Board/Tuyujia/__tests__/matcher.test.js`
- optional broader check:
  - `src/components/Board/__tests__/Board.component.test.js`

What the panel test should prove:

- receiver can enter text and generate a symbol sequence
- receiver can reorder generated symbols before sending
- receiver can replace a generated symbol with another catalog choice
- output bar receives the edited sequence
- receive history stores the final edited labels, not only the initial match

Manual review points:

- Decide whether the first upstream version should ship text input only and
  leave browser speech input for a follow-up
- Decide whether history and saved phrases belong in the same PR or a later
  follow-up
- Consider whether the PR should present the panel as experimental or optional

## Draft Commit and PR Copy

These are rehearsal drafts only. They are intentionally concise and can be
edited later to match the final staged diff.

### PR 2 draft

Suggested commit message:

- `feat: add tile matching hint fields`

Suggested PR title:

- `feat: add tile matching hint fields`

Suggested PR description:

```md
## Summary

This change adds optional tile-level metadata that can support future
text-to-symbol and symbol matching workflows.

## Included

- synonym hint field
- exclusion hint field
- semantic category hint field
- helper for reading and writing matching metadata

## What the fields are for

- `Matching synonyms`
  - optional extra phrases that should resolve to a tile
- `Exclude tokens`
  - optional phrases or short tokens that should not resolve to a tile
- `Semantic category`
  - optional domain hint for future ranking and disambiguation

## Why

These fields are generic and reusable beyond TuYuJia-specific workflows.
They improve the ability to annotate symbols for safer and more accurate
matching in future features.

## Verification

- `src/common/communicationSupport/tileMetadata.test.js`
- `src/components/Board/TileEditor/TileEditor.test.js`
```

Reviewer notes to keep in mind:

- Be ready to explain why these are generic metadata fields rather than
  product-specific fields
- Be ready to drop legacy mirroring from this PR if upstream prefers a smaller
  scope

### PR 3A draft

Suggested commit message:

- `refactor: extract neutral communication support utilities`

Suggested PR title:

- `refactor: extract neutral communication support utilities`

Suggested PR description:

```md
## Summary

This refactor extracts reusable communication-support utilities into a neutral
module structure.

## Included

- text-to-symbol matching utilities
- segmentation utilities
- phrase suggestion utilities
- browser speech helper
- local communication history and saved phrase storage helpers
- settings adapter for communication-support data

## Why

The extracted modules are intended to make future communication-support
features easier to build without coupling the implementation to TuYuJia-branded
UI.

## Verification

- `src/common/communicationSupport/localData.test.js`
- `src/common/communicationSupport/settingsAdapter.test.js`
- `src/common/communicationSupport/tileMetadata.test.js`
- `src/components/Board/Tuyujia/__tests__/matcher.test.js`
- `src/components/Board/Tuyujia/__tests__/templateNlg.test.js`
- `src/components/Board/Tuyujia/__tests__/localData.test.js`
```

Reviewer notes to keep in mind:

- Call out that compatibility exports still exist for migration safety
- Be ready to justify or defer `chineseLexicon.js` if reviewers want locale

### PR 4 draft

Suggested commit message:

- `feat: add receiver-side communication support loop`

Suggested PR title:

- `feat: add receiver-side communication support loop`

Final recommended scope:

- This PR should prove a complete receiver workflow
- It should stay focused on text input, symbol matching, review, and send
- It should avoid bringing in settings pages, saved phrases, or branded TuYuJia
  wrappers

Stage:

- `src/common/communicationSupport/symbolMatching.js`
- `src/common/communicationSupport/segmentation.js`
- `src/common/communicationSupport/chineseLexicon.js`
- `src/common/communicationSupport/tileMetadata.js`
- `src/common/communicationSupport/legacy.js`
- `src/common/communicationSupport/receiverPipeline.js`
- `src/components/Board/CommunicationSupport/ReceiverLoopPanel.component.js`
- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.css`
- `src/components/Board/CommunicationSupport/ReceiverLoopPanel.component.test.js`

Stage only if upstream accepts the panel being visible from the board:

- `src/components/Board/CommunicationSupport/CommunicationSupportFeature.component.js`
- `src/components/Board/CommunicationSupport/index.js`
- `src/components/Board/Board.component.js`
- `src/components/Board/Board.css`

Do not stage:

- `src/components/Board/Tuyujia/*`
- `src/components/Settings/CommunicationSupport/*`
- `src/components/Settings/Tuyujia/*`
- `src/common/communicationSupport/localData.js`
- `src/common/communicationSupport/settingsAdapter.js`
- `src/common/communicationSupport/browserSpeech.js`
- `../cboard-api/api/models/Settings.js`

Suggested PR description:

```md
## Summary

This change adds a receiver-side communication support loop for converting
short text into a reviewable symbol sequence before sending it to the output
bar.

## Included

- text input for the receiver flow
- text-to-symbol matching against loaded communication tiles
- token-to-match pipeline extracted into pure utilities
- review UI for inspecting matched symbols
- reorder actions for changing symbol sequence before send
- replace action for swapping a symbol with another tile choice
- send-to-output action using the edited result

## Why

This PR demonstrates a complete user-facing workflow rather than only adding
metadata or lower-level utilities.

For users and caregivers, the value is:

- enter a short phrase
- review what symbols were selected
- fix order or swap an incorrect symbol
- send the corrected sequence to the output bar

That makes the matching logic easier to evaluate in a real AAC workflow and
gives the supporting utilities an immediate, concrete consumer.

## Out of scope

- branded TuYuJia UI
- settings pages
- remote persistence
- saved phrases and history management UI
- browser speech input

## Verification

- `src/common/communicationSupport/receiverPipeline.test.js`
- `src/components/Board/CommunicationSupport/ReceiverLoopPanel.component.test.js`
- `src/components/Board/Tuyujia/__tests__/matcher.test.js`
```

Suggested reviewer-facing framing:

- This is a generic communication-support feature, not a TuYuJia-branded one
- The important behavior is not only matching, but letting the receiver review
  and correct the sequence before sending
- The first PR can stay text-only if browser speech feels too large for the
  initial upstream discussion

Expected reviewer questions:

- Why is the first version board-local rather than backed by settings or API?
- Should the panel land only as an embeddable component first, before a board
  entrypoint?
- Is the Chinese lexicon acceptable in a generic upstream PR, or should locale
  specific data be split later?

Prepared answers:

- Board-local matching keeps the first version small and demonstrable
- The component itself is the real feature boundary; board embedding can be a
  follow-up if needed
- The lexicon is only there to make the matching workflow testable and useful;
  if upstream wants a narrower first step, locale-specific data can be split
  into a follow-up

### PR 4 staging rehearsal result

Dry-run command used:

```bash
git add -n -- \
  src/common/communicationSupport/receiverPipeline.js \
  src/common/communicationSupport/symbolMatching.js \
  src/common/communicationSupport/segmentation.js \
  src/common/communicationSupport/chineseLexicon.js \
  src/common/communicationSupport/tileMetadata.js \
  src/common/communicationSupport/legacy.js \
  src/components/Board/CommunicationSupport/ReceiverLoopPanel.component.js \
  src/components/Board/CommunicationSupport/CommunicationSupportPanel.css \
  src/common/communicationSupport/receiverPipeline.test.js \
  src/components/Board/CommunicationSupport/ReceiverLoopPanel.component.test.js
```

Dry-run result:

- all listed files are stageable as a clean file set

Important boundary warning:

- the self-contained upstream boundary is now the text-token-match pipeline and
  `ReceiverLoopPanel.component.js`
- `CommunicationSupportPanel.component.js` is now a wrapper layer and should not
  be required in the smallest upstream PR

Current recommendation after rehearsal:

- The cleanest upstream PR can now target the pure receiver pipeline plus the
  receiver UI component
- Keep `CommunicationSupportPanel.component.js`, `localData.js`,
  `browserSpeech.js`, and `settingsAdapter.js` out unless upstream explicitly
  wants the wrapper integration in the same PR

### PR 3B draft

Suggested commit message:

- `feat: add generic communication support panels`

Suggested PR title:

- `feat: add generic communication support panels`

Suggested PR description:

```md
## Summary

This change adds a generic communication-support UI layer on top of the
previously extracted neutral utilities.

## Included

- generic board communication-support panel
- generic settings page for communication-support data
- neutral styling and tests for the generic settings surface

## Why

The goal is to provide a reusable UI shell for communication-support features
without depending on TuYuJia-branded entrypoints.

## Verification

- `src/components/Settings/CommunicationSupport/CommunicationSupport.component.test.js`
- optional broader check:
  - `src/components/Board/__tests__/Board.component.test.js`
```

Reviewer notes to keep in mind:

- This PR should avoid embedding the panel into the main Board page
- This PR should avoid adding product-specific settings navigation
- If reviewers want a narrower scope, split board UI and settings UI into
  separate follow-ups

## Local Refactor Checklist Before Any Upstream Attempt

- Rename `src/components/Board/Tuyujia/` to a neutral module name
- Rename the settings subtree from `tuyujia` to a neutral schema key
- Separate reusable logic from TuYuJia-specific UI
- Keep Board page embedding out of any upstream PR
- Keep Settings navigation integration out of any upstream PR
- Avoid mixing lockfile churn with feature PRs

## Recommended Near-term Local Branching Plan

Without submitting anything, prepare the codebase as if it could be split later.

1. Leave current product integration intact in the main fork branch
2. Internally tag files as `upstream-candidate` or `fork-only`
3. Refactor generic utilities into neutral paths while preserving behavior
4. Keep UI entry points TuYuJia-specific in the fork
5. Re-run focused tests after each extraction step

## Notes on Lockfiles

Current working tree also includes:

- `yarn.lock`
- `package-lock.json`

Do not bundle those automatically into any future upstream PR unless the PR is
specifically about dependency or build reproducibility.

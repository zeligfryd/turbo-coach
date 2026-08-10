/**
 * The typed service layer (§7.1) — the only way anything mutates multi-modality
 * data. Server actions do auth and IO, then call these. A coach later calls the
 * identical functions with `createdBy: 'coach'`.
 */

export {
  acceptBlock,
  createBlockTemplate,
  deleteBlock,
  rescheduleBlock,
  scheduleBlock,
  scheduleFromTemplate,
  updateBlock,
  BlockTemplateInput,
  ScheduleBlockInput,
  UpdateBlockInput,
  type ServiceResult,
} from "./blocks";

export {
  clearBlockCompletion,
  recordBlockCompletion,
  recordRideCompletion,
  resetAllAreaGoals,
  resetAreaGoal,
  setAreaGoal,
  RecordCompletionInput,
} from "./completion";

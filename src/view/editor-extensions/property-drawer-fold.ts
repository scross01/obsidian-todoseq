import { foldService } from '@codemirror/language';
import {
  findPropertyDrawerFoldRange,
  type IsTaskLine,
} from '../../utils/property-drawer-fold';

/**
 * Native CodeMirror fold provider for task-owned property drawers.
 *
 * The predicate is resolved lazily so parser rebuilds (for example after a
 * keyword change) are picked up without re-registering the editor extension.
 */
export const propertyDrawerFoldExtension = (
  getIsTaskLine: () => IsTaskLine | null,
) =>
  foldService.of((state, lineStart) =>
    findPropertyDrawerFoldRange(state, lineStart, getIsTaskLine()),
  );

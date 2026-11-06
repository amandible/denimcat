import type { ComponentType } from 'react';
import { RulesContent } from './components/RulesContent';
import { RulesContentV2 } from './components/RulesContentV2';

/** Mirrors engine-mint-condition's RULESET_VERSIONS — see docs/guides/game-rule-versions.md. */
const RULES_CONTENT_BY_VERSION: Record<string, ComponentType> = {
  v1: RulesContent,
  v2: RulesContentV2,
};

/** Undefined means either v1 or a room older than versioning itself — both mean "the original rules." */
export function resolveRulesContent(versionId: string | undefined): ComponentType {
  return RULES_CONTENT_BY_VERSION[versionId ?? 'v1'] ?? RulesContent;
}

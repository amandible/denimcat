import type { RulesetVersion } from '@denimcat/platform';
import { v1Ruleset } from './prizes';
import { v2Ruleset } from './rulesetV2';
import type { MintConditionRuleset } from './ruleset';

export const RULESET_VERSIONS: Record<string, RulesetVersion<MintConditionRuleset>> = {
  v1: {
    id: 'v1',
    designerNote: 'The original rules.',
    ruleset: v1Ruleset,
  },
  v2: {
    id: 'v2',
    designerNote: 'Making it way better to win blank auctions.',
    whatsNew:
      "Winning an empty prize is now much better: You always get card draw, and can optionally accelerate prize movement or placement. Also, if it was a high slot, you draw more cards.",
    ruleset: v2Ruleset,
  },
};

export const CURRENT_RULESET_VERSION_ID = 'v2';

// Cheap guard against the one mistake that would actually matter at
// runtime — see docs/guides/game-rule-versions.md's obsoletion workflow.
if (RULESET_VERSIONS[CURRENT_RULESET_VERSION_ID]?.obsolete) {
  throw new Error(`CURRENT_RULESET_VERSION_ID (${CURRENT_RULESET_VERSION_ID}) must not be marked obsolete.`);
}

/** Undefined means either v1 or a room older than versioning itself — both mean "the original rules." */
export function resolveRuleset(versionId: string | undefined): MintConditionRuleset {
  return (RULESET_VERSIONS[versionId ?? 'v1'] ?? RULESET_VERSIONS.v1).ruleset;
}

export function describeRulesetVersion(
  versionId: string | undefined,
): { designerNote: string; whatsNew?: string; isCurrentVersion: boolean } | null {
  const resolvedId = versionId ?? 'v1';
  const v = RULESET_VERSIONS[resolvedId];
  if (!v) return null;
  return { designerNote: v.designerNote, whatsNew: v.whatsNew, isCurrentVersion: resolvedId === CURRENT_RULESET_VERSION_ID };
}

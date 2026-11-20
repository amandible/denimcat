import { describe, expect, it } from 'vitest';
import { v1Ruleset } from '../src/prizes';
import { v2Ruleset } from '../src/rulesetV2';
import { v3Ruleset } from '../src/rulesetV3';
import { CURRENT_RULESET_VERSION_ID, describeRulesetVersion, resolveRuleset } from '../src/versions';

describe('CURRENT_RULESET_VERSION_ID', () => {
  it('is v3', () => {
    expect(CURRENT_RULESET_VERSION_ID).toBe('v3');
  });
});

describe('resolveRuleset', () => {
  it('resolves v3 to v3Ruleset', () => {
    expect(resolveRuleset('v3')).toBe(v3Ruleset);
  });

  it('resolves v2 to v2Ruleset', () => {
    expect(resolveRuleset('v2')).toBe(v2Ruleset);
  });

  it('resolves undefined (a pre-versioning room) to v1Ruleset', () => {
    expect(resolveRuleset(undefined)).toBe(v1Ruleset);
  });
});

describe('describeRulesetVersion', () => {
  it('marks v3 as the current version', () => {
    expect(describeRulesetVersion('v3')?.isCurrentVersion).toBe(true);
  });

  it('marks v2 as no longer current', () => {
    expect(describeRulesetVersion('v2')?.isCurrentVersion).toBe(false);
  });
});

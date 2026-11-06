/**
 * One versioned bundle of a game's rules, built by overriding only the
 * specific functions that actually changed — see
 * docs/guides/game-rule-versions.md for the full authoring practice.
 * `TRuleset` is whatever plain object of named functions a particular
 * game's engine groups its overridable behavior into (e.g.
 * MintConditionRuleset, defined in that game's own engine package) —
 * this type itself is completely game-agnostic and is never specialized
 * here.
 */
export interface RulesetVersion<TRuleset> {
  /**
   * Stable, permanent id. Once any room is created referencing this id
   * (via GameModule.currentRulesetVersionId at the time it was created),
   * it is persisted on that room forever (PersistedRoom.rulesetVersion)
   * — never rename or reuse an id for a different ruleset.
   */
  id: string;
  /**
   * A short note in the designer's own words, for whoever works on the
   * next version — never invented on her behalf; use a literal
   * `TODO: <description>` placeholder until she supplies real text.
   */
  designerNote: string;
  /**
   * The longer "what's new" message shown to players at the start of a
   * game created on this version, specifically so a repeat playtester
   * expects the change rather than assuming the old rules still apply.
   * Omit for a game's very first version (nothing to compare against
   * yet). Never invented — `TODO: <description>` until supplied.
   */
  whatsNew?: string;
  /**
   * Set once this version is confirmed to have zero rooms still
   * referencing it in production — see docs/guides/game-rule-versions.md's
   * cleanup workflow. No longer selectable for a brand-new room (a
   * game's own currentRulesetVersionId must never point at an obsolete
   * version). A room already pinned to an obsolete version keeps
   * working completely unmodified; this flag has zero runtime effect by
   * itself. It exists purely so a human or an agent doing cleanup later
   * can find this version and know it's safe to remove the code paths
   * that exist only to support it.
   */
  obsolete?: boolean;
  ruleset: TRuleset;
}

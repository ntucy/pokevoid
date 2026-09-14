import { PlayableChampionData } from "#app/system/playable-champions";
import { CHAMPION_DEFINITIONS, initializeChampionDefinitions } from "#app/system/champion-registry";
import { GameData } from "#app/system/game-data";
import { DEBUG_BYPASS_CHAMPION_UNLOCK, DEBUG_FORCE_LOCK_CHAMPIONS } from "#app/overrides";
import { getAbilitiesForTypes } from "#app/system/type-ability-mappings";
import { Type } from "#app/data/type";
import { getRaritiesForRewardType } from "#app/system/skill-tree-node-generator";
import { SkillTreeRarity } from "#app/system/skill-tree-data";
import { SkillTreeUtils } from "#app/system/skill-tree-utils";

export class ChampionManager {
  private static instance: ChampionManager | null = null;
  static initialize(gameData: GameData): ChampionManager {
    ChampionManager.instance = new ChampionManager(gameData);
    return ChampionManager.instance;
  }
  static getInstance(): ChampionManager {
    if (!ChampionManager.instance) {
      throw new Error("ChampionManager not initialized. Call ChampionManager.initialize(gameData) first.");
    }
    return ChampionManager.instance;
  }

  constructor(private readonly gameData: GameData) {}

  getChampionData(championId: string): PlayableChampionData {
    if (!this.gameData.championData) {
      this.gameData.championData = {};
    }
    if (!this.gameData.championData[championId]) {
      this.gameData.championData[championId] = this.createDefaultChampionData(championId);
    }

    const data = this.gameData.championData[championId] as PlayableChampionData;

    if (!data.id) {
      data.id = championId;
    }

    const definition = CHAMPION_DEFINITIONS[championId];

    if (definition) {
      if (!data.signaturePokemon?.length && definition.signaturePokemon?.length) {
        data.signaturePokemon = [...definition.signaturePokemon];
      }
      if (data.level == null) {
        data.level = 1;
      }
      if (data.xp == null) {
        data.xp = 0;
      }
    }

    const registrySkills = definition?.lockedSkills;
    const unlocked = data.unlockedSkills || {};

    if (!data.lockedSkills || Object.keys(data.lockedSkills).length === 0) {
      if (registrySkills) {
        const fullSkills = JSON.parse(JSON.stringify(registrySkills));
        for (const key of Object.keys(unlocked)) {
          delete fullSkills[key];
        }
        data.lockedSkills = fullSkills;
      }
    } else if (registrySkills) {
      for (const key of Object.keys(unlocked)) {
        delete data.lockedSkills[key];
      }
      for (const [key, skillDef] of Object.entries(registrySkills)) {
        if (unlocked[key]) continue;
        if (!data.lockedSkills[key]) {
          data.lockedSkills[key] = JSON.parse(JSON.stringify(skillDef));
        }
      }
    }

    if ((championId === "apollo" || championId === "diana" || championId === "apollo_diana") && this.gameData.activeSkillTree) {
      const ast = this.gameData.activeSkillTree;

      if (ast.runtimeType1 !== undefined) {
        data.type1 = ast.runtimeType1;
      }
      if (ast.runtimeType2 !== undefined) {
        data.type2 = ast.runtimeType2;
      }

      if (ast.runtimeType1 !== undefined || ast.runtimeType2 !== undefined) {
        const runtimeTypes = [ast.runtimeType1, ast.runtimeType2].filter(t => t !== undefined) as Type[];

        data.unlockedTypeBoosters = [...runtimeTypes];
        data.unlockedEssenceBundles = [...runtimeTypes];
        data.unlockedTypeSwitchers = [...runtimeTypes];
        data.unlockedTeraTypes = [...runtimeTypes];
        data.unlockedAbilities = getAbilitiesForTypes(runtimeTypes);
      }
    }

    if (data.lockedSkills) {
      this.populateSkillEssenceRequirements(data);
    }

    return data;
  }

  private createDefaultChampionData(championId: string): PlayableChampionData {
    const definition = CHAMPION_DEFINITIONS[championId];
    if (!definition) {
      throw new Error(`Champion definition not found: ${championId}`);
    }

    const lockedSkills = definition?.lockedSkills
      ? JSON.parse(JSON.stringify(definition.lockedSkills))
      : {};

    const data = {
      ...definition,
      lockedSkills,
      id: championId,
      level: 1,
      xp: 0,
      unlockedTMs: definition.unlockedTMs || [],
      unlockedXMs: definition.unlockedXMs || [],
      unlockedAbilities: definition.unlockedAbilities || [],
      unlockedSmittyAbilities: definition.unlockedSmittyAbilities || [],
      unlockedMegaStones: definition.unlockedMegaStones || [],
      unlockedMaxMushrooms: definition.unlockedMaxMushrooms || false,
      unlockedTypeSwitchers: definition.unlockedTypeSwitchers || [],
      unlockedEssenceBundles: definition.unlockedEssenceBundles || [],
      unlockedPermaItems: definition.unlockedPermaItems || [],
      unlockedStatBoosts: definition.unlockedStatBoosts || [],
      unlockedAltBuilds: definition.unlockedAltBuilds || [],
      unlockedTrainerBondAbilities: (definition as any).unlockedTrainerBondAbilities || [],
      unlockedTeraAbilities: (definition as any).unlockedTeraAbilities || {},
      unlockedMoveUpgrades: definition.unlockedMoveUpgrades || [],
      unlockedConditionalAbilities: definition.unlockedConditionalAbilities || [],
      unlockedSkills: {}
    } as PlayableChampionData;

    this.populateSkillEssenceRequirements(data);

    return data;
  }

  private populateSkillEssenceRequirements(championData: PlayableChampionData): void {
    const excludedTypes = new Set([Type.UNKNOWN, (Type as any).ALL, Type.STELLAR]);

    let effectiveType1 = championData.type1;
    let effectiveType2 = championData.type2;
    const validTypes = [effectiveType1, effectiveType2].filter(
      (t: any) => t !== undefined && t !== null && typeof t === "number" && !excludedTypes.has(t)
    );
    if (validTypes.length === 0) {
      const cid = championData.id;
      if (cid === "apollo_diana" || cid === "apollo" || cid === "diana") {
        const fallbackId = cid === "apollo_diana" ? "apollo" : cid;
        const fallbackDef = CHAMPION_DEFINITIONS[fallbackId] as any;
        if (fallbackDef) {
          effectiveType1 = fallbackDef.type1;
          effectiveType2 = fallbackDef.type2;
        }
      }
    }

    const effectiveTypes = new Set(
      [effectiveType1, effectiveType2].filter(
        (t: any) => t !== undefined && t !== null && typeof t === "number" && t >= 0 && t <= 17
      )
    );

    const isApolloDiana = (championData.id === "apollo" || championData.id === "diana" || championData.id === "apollo_diana");

    for (const [skillId, skillDef] of Object.entries(championData.lockedSkills)) {
      let skillType1 = effectiveType1;
      let skillType2 = effectiveType2;
      if (isApolloDiana) {
        const hashTypes = SkillTreeUtils.getApolloDianaTypesForLevel(championData.id, skillDef.unlockLevel);
        skillType1 = hashTypes.type1;
        skillType2 = hashTypes.type2;
      }

      if (!isApolloDiana && skillDef.requiredEssenceWeights && skillDef.requiredEssenceWeights.length > 0) {
        const hasStandardType = skillDef.requiredEssenceWeights.some(
          (w: any) => typeof w.type === 'number' && w.type >= 0 && w.type <= 17
        );
        if (hasStandardType && effectiveTypes.size > 0) {
          const weightsMatchChampion = skillDef.requiredEssenceWeights.some(
            (w: any) => typeof w.type === 'number' && w.type >= 0 && w.type <= 17 && effectiveTypes.has(w.type)
          );
          if (weightsMatchChampion) continue;
        } else if (hasStandardType) {
          continue;
        }
      }

      const rarities = getRaritiesForRewardType(skillDef.rewardType);
      const rarity = rarities[0] || SkillTreeRarity.GREAT;

      const requirements = SkillTreeUtils.calculateSkillEssenceRequirements(
        skillDef.unlockLevel,
        championData.id,
        skillType1,
        skillType2,
        skillDef.rewardType,
        rarity
      );

      skillDef.requiredEssenceWeights = requirements.map(req => ({
        type: req.type,
        amount: req.amount
      }));
    }
  }

  isChampionUnlocked(championId: string): boolean {
    if (DEBUG_BYPASS_CHAMPION_UNLOCK) {
      return true;
    }
    if (DEBUG_FORCE_LOCK_CHAMPIONS.length > 0 && DEBUG_FORCE_LOCK_CHAMPIONS.includes(championId)) {
      return false;
    }
    return this.isChampionUnlockedInData(championId);
  }

  isChampionUnlockedInData(championId: string): boolean {
    if (championId === "apollo_diana" || championId === "apollo" || championId === "diana") return true;
    const data = (this.gameData.championData?.[championId] as any) || null;
    const isUnlocked = data?.isUnlocked === true;
    return isUnlocked;
  }

  getAvailableChampions(): string[] {
    const definitions = initializeChampionDefinitions();
    const allIds = Object.keys(definitions);
    const available = allIds.filter((id) => this.isChampionUnlocked(id));
    return available;
  }

  tryAutoUnlockChampion(championId: string): boolean {
    if (this.isChampionUnlockedInData(championId)) return false;

    const definition = CHAMPION_DEFINITIONS[championId];
    if (!definition) return false;

    const req = definition.unlockRequirements;
    if (!req) return false;

    if (req.essenceRequirements && req.essenceRequirements.length > 0) {
      return false;
    }

    if (req.totalEssenceRequirement && req.totalEssenceRequirement > 0) {
      return false;
    }

    if (req.prerequisiteChampions && req.prerequisiteChampions.length > 0) {
      for (const prereq of req.prerequisiteChampions) {
        if (!this.isChampionUnlockedInData(prereq)) return false;
      }
    }

    if (req.rivalDefeatRequired) {
      const rivalType = req.rivalDefeatRequired.trainerType;
      if (!this.gameData.defeatedRivals.includes(rivalType as any)) return false;
    }

    if (!this.gameData.championData) {
      this.gameData.championData = {};
    }
    if (!this.gameData.championData[championId]) {
      this.gameData.championData[championId] = this.getChampionData(championId);
    }
    (this.gameData.championData[championId] as any).isUnlocked = true;
    return true;
  }
}
import { clamp } from "./math";
import type { Koi } from "./koi";

export interface EcologySnapshot {
  waterQuality: number;
  clarity: number;
  oxygen: number;
  waste: number;
  nutrients: number;
  filterCondition: number;
  algaeBloom: number;
  averageHunger: number;
  averageHealth: number;
  averageStress: number;
  livingKoi: number;
}

export class PondEcology {
  public waterQuality = 0.96;
  public clarity = 0.97;
  public oxygen = 0.95;
  public waste = 0.035;
  public nutrients = 0.07;
  public filterCondition = 1;
  public algaeBloom = 0.08;
  public aerationSeconds = 0;

  public reset(): void {
    this.waterQuality = 0.96;
    this.clarity = 0.97;
    this.oxygen = 0.95;
    this.waste = 0.035;
    this.nutrients = 0.07;
    this.filterCondition = 1;
    this.algaeBloom = 0.08;
    this.aerationSeconds = 0;
  }

  public recordFoodAdded(count: number): void {
    this.nutrients = clamp(this.nutrients + count * 0.00018, 0, 1);
  }

  public recordPelletEaten(): void {
    this.waste = clamp(this.waste + 0.00115, 0, 1);
    this.nutrients = clamp(this.nutrients + 0.00075, 0, 1);
  }

  public recordPelletsDecayed(count: number): void {
    if (count <= 0) return;
    this.waste = clamp(this.waste + count * 0.006, 0, 1);
    this.nutrients = clamp(this.nutrients + count * 0.008, 0, 1);
    this.oxygen = clamp(this.oxygen - count * 0.0018, 0, 1);
  }

  public cleanFilter(): void {
    this.filterCondition = 1;
    this.waste = Math.max(0, this.waste - 0.1);
    this.nutrients = Math.max(0, this.nutrients - 0.035);
  }

  public waterChange(): void {
    this.waste *= 0.22;
    this.nutrients *= 0.36;
    this.algaeBloom *= 0.62;
    this.clarity = Math.max(this.clarity, 0.92);
    this.oxygen = Math.max(this.oxygen, 0.94);
    this.waterQuality = Math.max(this.waterQuality, 0.9);
    this.filterCondition = Math.max(this.filterCondition, 0.72);
  }

  public aerate(): void {
    this.aerationSeconds = Math.max(this.aerationSeconds, 75);
    this.oxygen = clamp(this.oxygen + 0.12, 0, 1);
  }

  public update(
    dt: number,
    fish: readonly Koi[],
    count: number,
    plantSupport: number,
    rainIntensity: number,
  ): void {
    const living = fish.slice(0, count).filter((koi) => koi.alive);
    const fishLoad = living.length / 14;
    const averageHunger =
      living.length === 0
        ? 0
        : living.reduce((total, koi) => total + koi.hunger, 0) / living.length;

    this.aerationSeconds = Math.max(0, this.aerationSeconds - dt);
    const aeration = this.aerationSeconds > 0 ? 1 : 0;

    this.waste = clamp(
      this.waste +
        dt * fishLoad * (0.000052 + averageHunger * 0.000018),
      0,
      1,
    );
    this.nutrients = clamp(
      this.nutrients + dt * this.waste * 0.00012,
      0,
      1,
    );

    const filtration =
      dt *
      (0.00011 + this.filterCondition * 0.00034) *
      (0.75 + plantSupport * 0.25);
    this.waste = Math.max(0, this.waste - filtration);
    this.nutrients = Math.max(
      0,
      this.nutrients - dt * (0.000035 + plantSupport * 0.000095),
    );

    this.filterCondition = clamp(
      this.filterCondition -
        dt * (0.000006 + this.waste * 0.000055 + fishLoad * 0.000004),
      0,
      1,
    );

    const bloomTarget = clamp(
      0.035 + this.nutrients * 0.72 + this.waste * 0.12,
      0.03,
      0.92,
    );
    this.algaeBloom +=
      (bloomTarget - this.algaeBloom) * (1 - Math.exp(-dt * 0.015));

    // Rain acts as natural surface aeration. Heavy rain helps meaningfully,
    // but diminishing returns keep it from replacing filtration/water changes.
    const rainAeration = Math.sqrt(clamp(rainIntensity, 0, 1)) * 0.18;
    const oxygenTarget = clamp(
      0.96 -
        this.waste * 0.5 -
        this.algaeBloom * 0.2 +
        plantSupport * 0.08 +
        rainAeration +
        aeration * 0.28,
      0.05,
      1,
    );
    this.oxygen +=
      (oxygenTarget - this.oxygen) *
      (1 - Math.exp(-dt * (aeration || rainIntensity > 0 ? 0.1 : 0.025)));

    const clarityTarget = clamp(
      1 -
        this.waste * 0.7 -
        this.nutrients * 0.14 -
        this.algaeBloom * 0.32,
      0.08,
      1,
    );
    this.clarity +=
      (clarityTarget - this.clarity) * (1 - Math.exp(-dt * 0.045));

    const qualityTarget = clamp(
      this.clarity * 0.32 +
        this.oxygen * 0.38 +
        (1 - this.waste) * 0.2 +
        this.filterCondition * 0.1,
      0,
      1,
    );
    this.waterQuality +=
      (qualityTarget - this.waterQuality) * (1 - Math.exp(-dt * 0.04));
  }

  public responseModifier(): number {
    const oxygenPenalty = clamp((this.oxygen - 0.15) / 0.7, 0.1, 1);
    return clamp(
      (0.18 + this.waterQuality * 0.82) * oxygenPenalty,
      0.08,
      1,
    );
  }

  public snapshot(fish: readonly Koi[], count: number): EcologySnapshot {
    const active = fish.slice(0, count);
    const living = active.filter((koi) => koi.alive);
    const average = (pick: (fish: Koi) => number): number =>
      living.length === 0
        ? 0
        : living.reduce((sum, item) => sum + pick(item), 0) / living.length;

    return {
      waterQuality: this.waterQuality,
      clarity: this.clarity,
      oxygen: this.oxygen,
      waste: this.waste,
      nutrients: this.nutrients,
      filterCondition: this.filterCondition,
      algaeBloom: this.algaeBloom,
      averageHunger: average((item) => item.hunger),
      averageHealth: average((item) => item.health),
      averageStress: average((item) => item.stress),
      livingKoi: living.length,
    };
  }
}

import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./config";
import { clamp, type Vec2, vec, XorShift32 } from "./math";

export interface FoodPellet {
  id: number;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  age: number;
  lifetime: number;
  wobble: number;
  alive: boolean;
}

const MAX_PELLETS = 180;

export class FoodSystem {
  public readonly pellets: FoodPellet[] = [];

  private readonly random = new XorShift32(0x51f15eed);
  private nextId = 1;
  private decayedCount = 0;

  public get activeCount(): number {
    let count = 0;
    for (const pellet of this.pellets) if (pellet.alive) count += 1;
    return count;
  }

  public scatter(point: Vec2, count = 34): number {
    const center = {
      x: clamp(point.x, 18, CANVAS_WIDTH - 18),
      y: clamp(point.y, 18, CANVAS_HEIGHT - 18),
    };

    for (let index = 0; index < count; index += 1) {
      const angle = this.random.range(0, Math.PI * 2);
      const distance = Math.sqrt(this.random.unit()) * this.random.range(10, 37);
      const outlier = this.random.unit() < 0.12 ? this.random.range(1.25, 1.8) : 1;
      const x = clamp(
        center.x + Math.cos(angle) * distance * outlier,
        5,
        CANVAS_WIDTH - 5,
      );
      const y = clamp(
        center.y + Math.sin(angle) * distance * 0.62 * outlier,
        5,
        CANVAS_HEIGHT - 5,
      );

      this.pellets.push({
        id: this.nextId++,
        position: vec(x, y),
        velocity: vec(
          this.random.range(-1.6, 1.6),
          this.random.range(-0.85, 0.85),
        ),
        radius: this.random.range(1.05, 1.65),
        age: -this.random.range(0, 0.32),
        lifetime: this.random.range(26, 42),
        wobble: this.random.range(0, Math.PI * 2),
        alive: true,
      });
    }

    if (this.pellets.length > MAX_PELLETS) {
      this.pellets.splice(0, this.pellets.length - MAX_PELLETS);
    }
    return count;
  }

  public update(dt: number, time: number): void {
    for (const pellet of this.pellets) {
      if (!pellet.alive) continue;
      pellet.age += dt;
      if (pellet.age > pellet.lifetime) {
        pellet.alive = false;
        this.decayedCount += 1;
        continue;
      }
      if (pellet.age < 0) continue;

      const driftX = Math.sin(time * 0.21 + pellet.wobble) * 0.22;
      const driftY = Math.cos(time * 0.17 + pellet.wobble * 1.7) * 0.14;
      pellet.velocity.x += driftX * dt;
      pellet.velocity.y += driftY * dt;
      const damping = Math.exp(-0.32 * dt);
      pellet.velocity.x *= damping;
      pellet.velocity.y *= damping;
      pellet.position.x += pellet.velocity.x * dt;
      pellet.position.y += pellet.velocity.y * dt;

      if (pellet.position.x < 4 || pellet.position.x > CANVAS_WIDTH - 4) {
        pellet.velocity.x *= -0.45;
        pellet.position.x = clamp(pellet.position.x, 4, CANVAS_WIDTH - 4);
      }
      if (pellet.position.y < 4 || pellet.position.y > CANVAS_HEIGHT - 4) {
        pellet.velocity.y *= -0.45;
        pellet.position.y = clamp(pellet.position.y, 4, CANVAS_HEIGHT - 4);
      }
    }
  }

  public nearest(point: Vec2, maximumDistance = Infinity): FoodPellet | null {
    let best: FoodPellet | null = null;
    let bestDistanceSquared = maximumDistance * maximumDistance;
    for (const pellet of this.pellets) {
      if (!pellet.alive || pellet.age < 0) continue;
      const dx = pellet.position.x - point.x;
      const dy = pellet.position.y - point.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= bestDistanceSquared) continue;
      best = pellet;
      bestDistanceSquared = distanceSquared;
    }
    return best;
  }

  public consume(pellet: FoodPellet): void {
    pellet.alive = false;
  }

  public takeDecayedCount(): number {
    const count = this.decayedCount;
    this.decayedCount = 0;
    return count;
  }

  public resize(scaleX: number, scaleY: number): void {
    for (const pellet of this.pellets) {
      pellet.position.x *= scaleX;
      pellet.position.y *= scaleY;
      pellet.velocity.x *= scaleX;
      pellet.velocity.y *= scaleY;
    }
  }

  public reset(): void {
    this.pellets.length = 0;
    this.decayedCount = 0;
  }
}

import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./config";
import { clamp, type Vec2, vec, XorShift32 } from "./math";
import type { Koi } from "./koi";

export interface BioluminescentParticle {
  position: Vec2;
  velocity: Vec2;
  density: number;
  excitation: number;
  phase: number;
}

const PARTICLE_COUNT = 320;

export class BioluminescenceSystem {
  public readonly particles: BioluminescentParticle[] = [];
  private readonly random = new XorShift32(0xb10a1a9e);

  public constructor() {
    this.reset();
  }

  public reset(): void {
    this.particles.length = 0;
    this.random.state = 0xb10a1a9e;
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      this.particles.push({
        position: vec(
          this.random.range(0, CANVAS_WIDTH),
          this.random.range(0, CANVAS_HEIGHT),
        ),
        velocity: vec(
          this.random.range(-0.16, 0.16),
          this.random.range(-0.11, 0.11),
        ),
        density: this.random.range(0.18, 0.7),
        excitation: 0,
        phase: this.random.range(0, Math.PI * 2),
      });
    }
  }

  public disturb(point: Vec2, strength = 1, direction: Vec2 = vec()): void {
    const radius = 32 + strength * 10;
    const radiusSquared = radius * radius;
    for (const particle of this.particles) {
      const dx = particle.position.x - point.x;
      const dy = particle.position.y - point.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radiusSquared) continue;
      const distance = Math.sqrt(Math.max(distanceSquared, 0.001));
      const falloff = 1 - distance / radius;
      particle.excitation = clamp(
        particle.excitation + falloff * (0.48 + strength * 0.42),
        0,
        1.4,
      );
      particle.density = Math.max(0.04, particle.density - falloff * 0.045);
      const push = falloff * (1.1 + strength * 1.8);
      particle.velocity.x +=
        (dx / distance) * push + direction.x * falloff * 0.035;
      particle.velocity.y +=
        (dy / distance) * push + direction.y * falloff * 0.035;
    }
  }

  public update(
    dt: number,
    time: number,
    fish: readonly Koi[],
    count: number,
    nutrients: number,
  ): void {
    const targetDensity = clamp(0.2 + nutrients * 0.72, 0.2, 0.92);
    for (const particle of this.particles) {
      for (let index = 0; index < count; index += 1) {
        const koi = fish[index];
        if (!koi.alive) continue;
        const dx = particle.position.x - koi.position.x;
        const dy = particle.position.y - koi.position.y;
        const wakeRadius = Math.max(10, koi.bodyWidth * 3.4);
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > wakeRadius * wakeRadius) continue;
        const distance = Math.sqrt(Math.max(distanceSquared, 0.001));
        const falloff = 1 - distance / wakeRadius;
        const speedAmount = clamp(
          koi.speed / Math.max(koi.maximumSpeed, 1),
          0.15,
          1,
        );
        particle.excitation = clamp(
          particle.excitation + falloff * (0.08 + speedAmount * 0.18),
          0,
          1.4,
        );
        particle.density = Math.max(
          0.035,
          particle.density - falloff * 0.012,
        );
        particle.velocity.x +=
          (dx / distance) * falloff * speedAmount * 0.42;
        particle.velocity.y +=
          (dy / distance) * falloff * speedAmount * 0.42;
      }

      const drift = 0.035;
      particle.velocity.x +=
        Math.sin(time * 0.07 + particle.phase) * drift * dt;
      particle.velocity.y +=
        Math.cos(time * 0.055 + particle.phase * 1.31) * drift * dt;
      const damping = Math.exp(-1.2 * dt);
      particle.velocity.x *= damping;
      particle.velocity.y *= damping;
      particle.position.x += particle.velocity.x * dt;
      particle.position.y += particle.velocity.y * dt;

      if (particle.position.x < 0) particle.position.x += CANVAS_WIDTH;
      if (particle.position.x > CANVAS_WIDTH) particle.position.x -= CANVAS_WIDTH;
      if (particle.position.y < 0) particle.position.y += CANVAS_HEIGHT;
      if (particle.position.y > CANVAS_HEIGHT) particle.position.y -= CANVAS_HEIGHT;

      particle.excitation *= Math.exp(-dt * 0.72);
      particle.density +=
        (targetDensity - particle.density) * (1 - Math.exp(-dt * 0.012));
    }
  }

  public resize(scaleX: number, scaleY: number): void {
    for (const particle of this.particles) {
      particle.position.x *= scaleX;
      particle.position.y *= scaleY;
      particle.velocity.x *= scaleX;
      particle.velocity.y *= scaleY;
    }
  }
}

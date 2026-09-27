"use client";

import { HeartIcon } from "@/components/mirro/icons/heart";
import { MenuIcon } from "@/components/mirro/icons/menu";
import { CopyIcon } from "@/components/mirro/icons/copy";
import { CheckIcon } from "@/components/mirro/icons/check";
import { SunMoonIcon } from "@/components/mirro/icons/sun-moon";

const ICONS = [
  { name: "heart", label: "hover + click", Icon: HeartIcon },
  { name: "menu", label: "click to morph", Icon: MenuIcon },
  { name: "copy", label: "click to copy", Icon: CopyIcon },
  { name: "check", label: "click to draw", Icon: CheckIcon },
  { name: "sun-moon", label: "click to toggle", Icon: SunMoonIcon },
];

export function IconShowcase() {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-5">
      {ICONS.map(({ name, label, Icon }) => (
        <div
          key={name}
          className="group flex flex-col items-center justify-center gap-4 bg-card px-4 py-12 transition-colors duration-200 ease-out hover:bg-muted/60"
        >
          <Icon size={36} />
          <div className="text-center">
            <p className="font-mono text-xs text-foreground">{name}</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

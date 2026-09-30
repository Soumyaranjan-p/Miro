import json

checks = {
    "registry/scramble-text.json": "src/components/mirro/components/scramble-text.tsx",
    "registry/typewriter-text.json": "src/components/mirro/components/typewriter-text.tsx",
    "registry/blur-text.json": "src/components/mirro/components/blur-text.tsx",
    "registry/shimmer-button.json": "src/components/mirro/components/shimmer-button.tsx",
    "registry/send.json": "src/components/mirro/icons/send.tsx",
}

stale_markers = [
    'typeof children === "string"',
    "children: ReactNode",
    "-translate-x-full",
]

for j, src in checks.items():
    with open(j, encoding="utf-8") as fh:
        embedded = json.load(fh)["files"][0]["content"].replace("\r\n", "\n").strip()
    with open(src, encoding="utf-8") as fh:
        disk = fh.read().replace("\r\n", "\n").strip()
    status = "OK  " if embedded == disk else "DIFF"
    print(f"{status} {j:36s} <= {src}  ({len(embedded)} vs {len(disk)})")
    for bad in stale_markers:
        if bad in embedded:
            print(f"       !! still contains: {bad}")

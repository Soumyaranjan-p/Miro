@echo off
rem Miro fallback toolchain: static archiver via Zig's LLVM archiver.
setlocal
if not defined ZIG set "ZIG=zig"
set "ZIG_GLOBAL_CACHE_DIR=%TEMP%\miro-zig-cache\global"
set "ZIG_LOCAL_CACHE_DIR=%TEMP%\miro-zig-cache\local"
"%ZIG%" ar %*

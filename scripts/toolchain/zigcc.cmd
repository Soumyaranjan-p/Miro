@echo off
rem C compiler for Miro's whisper.cpp build, via Zig.
rem
rem Same two jobs as zigcxx.cmd: keep Zig's caches off the user profile, and
rem drop the MSVC-only /utf-8 flag that CMake projects pass on Windows but no
rem clang or gcc driver accepts. The substitution works on the raw argument
rem string, so quoting and '=' inside arguments survive intact.
setlocal EnableExtensions
if not defined ZIG set "ZIG=zig"
set "ZIG_GLOBAL_CACHE_DIR=%TEMP%\miro-zig-cache\global"
set "ZIG_LOCAL_CACHE_DIR=%TEMP%\miro-zig-cache\local"

set "MIRO_ARGS=%*"
set "MIRO_ARGS=%MIRO_ARGS:/utf-8=%"

"%ZIG%" cc %MIRO_ARGS%
exit /b %ERRORLEVEL%

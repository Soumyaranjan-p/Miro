@echo off
rem C++ compiler for Miro's whisper.cpp build, via Zig.
rem
rem Two jobs:
rem   1. keep Zig's caches off the user profile (it wants APPDATA, which is not
rem      always set in non-interactive shells);
rem   2. drop the MSVC-only /utf-8 flag that CMake projects pass unconditionally
rem      on Windows. whisper-rs-sys adds it to CMAKE_CXX_FLAGS, and no clang or
rem      gcc driver understands it:
rem        zig c++ /utf-8 ...    -> error: /utf-8: unrecognized file extension
rem        clang++ /utf-8 ...    -> error: no such file or directory: '/utf-8'
rem      It only asks for UTF-8 source handling, which is already the default
rem      for these compilers, so removing it changes nothing but the exit code.
rem
rem The substitution is done on the raw argument string so that quoting and
rem arguments containing '=' (such as -std=c++17) reach the compiler untouched.
setlocal EnableExtensions
if not defined ZIG set "ZIG=zig"
set "ZIG_GLOBAL_CACHE_DIR=%TEMP%\miro-zig-cache\global"
set "ZIG_LOCAL_CACHE_DIR=%TEMP%\miro-zig-cache\local"

set "MIRO_ARGS=%*"
set "MIRO_ARGS=%MIRO_ARGS:/utf-8=%"

"%ZIG%" c++ %MIRO_ARGS%
exit /b %ERRORLEVEL%

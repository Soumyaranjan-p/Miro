# CMake toolchain used when building whisper.cpp without MSVC.
# Pass with: -DCMAKE_TOOLCHAIN_FILE=... or CMAKE_TOOLCHAIN_FILE in the environment.
set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR x86_64)

get_filename_component(MIRO_TOOLCHAIN_DIR "${CMAKE_CURRENT_LIST_FILE}" DIRECTORY)
set(MIRO_ZIGCC "${MIRO_TOOLCHAIN_DIR}/zigcc.cmd")
set(MIRO_ZIGCXX "${MIRO_TOOLCHAIN_DIR}/zigcxx.cmd")
set(MIRO_ZIGAR "${MIRO_TOOLCHAIN_DIR}/zigar.cmd")

set(CMAKE_C_COMPILER "${MIRO_ZIGCC}")
set(CMAKE_CXX_COMPILER "${MIRO_ZIGCXX}")
set(CMAKE_AR "${MIRO_ZIGAR}")
set(CMAKE_RANLIB "")

# Zig drives lld itself; keep CMake from looking for MSVC's linker.
set(CMAKE_LINKER "${MIRO_ZIGCXX}")

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE NEVER)

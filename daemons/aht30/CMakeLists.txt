cmake_minimum_required(VERSION 3.16)
project(aht30_daemon CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(include)

add_library(aht30_sensor
    src/aht30_sensor.cpp
)

target_include_directories(aht30_sensor PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

add_executable(test_read_once
    src/test_read_once.cpp
)

target_link_libraries(test_read_once PRIVATE aht30_sensor)

add_executable(aht30_daemon
    src/aht30_daemon.cpp
)

target_include_directories(aht30_daemon PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party
)

target_link_libraries(aht30_daemon PRIVATE aht30_sensor)

#pragma once

#include <cstdint>
#include <string>

struct Aht30Reading {
    double temp_c = 0.0;
    double temp_f = 0.0;
    double humidity = 0.0;
    uint8_t status = 0;
    bool busy = false;
};

struct Aht30Result {
    bool ok = false;
    Aht30Reading reading{};
    std::string error;
};

// Read one measurement from an AHT30 sensor over I2C.
// Typical Raspberry Pi I2C bus device: "/dev/i2c-1"
// Typical AHT30 address: 0x38
Aht30Result read_aht30_once(const std::string& i2c_device, int i2c_addr);

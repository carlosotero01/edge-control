#include "aht30_sensor.h"
#include <iostream>
#include <iomanip>

int main() {
    auto res = read_aht30_once("/dev/i2c-1", 0x38);

    if (!res.ok) {
        std::cerr << "AHT30 read failed: " << res.error << "\n";
        return 1;
    }

    std::cout << std::fixed << std::setprecision(2)
              << "AHT30 -> Temp: " << res.reading.temp_c << " C ("
              << res.reading.temp_f << " F), RH: "
              << res.reading.humidity << " %"
              << (res.reading.busy ? " (BUSY bit set)" : "")
              << "\n";

    return 0;
}

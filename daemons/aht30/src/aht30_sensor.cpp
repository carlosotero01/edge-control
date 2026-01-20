#include "aht30_sensor.h"

#include <cerrno>
#include <cstring>
#include <cstdint>

#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/i2c-dev.h>

#define AHT30_ADDR_DEFAULT  0x38

// AHT30 measurement command: 0xAC 0x33 0x00, then wait ~80 ms, then read 7 bytes.
static const uint8_t MEASURE_CMD[3] = { 0xAC, 0x33, 0x00 };
static const int     MEASURE_DELAY_US = 80000;   // 80 ms
static const size_t  READ_LEN = 7;

// CRC-8: poly 0x31, init 0xFF (AHT family)
static uint8_t crc8_aht(const uint8_t* data, size_t len) {
    uint8_t crc = 0xFF;
    for (size_t i = 0; i < len; ++i) {
        crc ^= data[i];
        for (int b = 0; b < 8; ++b) {
            if (crc & 0x80) crc = (uint8_t)((crc << 1) ^ 0x31);
            else           crc = (uint8_t)(crc << 1);
        }
    }
    return crc;
}

Aht30Result read_aht30_once(const std::string& i2c_device, int i2c_addr) {
    Aht30Result result{};
    const int addr = (i2c_addr == 0) ? AHT30_ADDR_DEFAULT : i2c_addr;

    int file = open(i2c_device.c_str(), O_RDWR);
    if (file < 0) {
        result.ok = false;
        result.error = "Failed to open I2C device " + i2c_device + ": " + std::strerror(errno);
        return result;
    }

    if (ioctl(file, I2C_SLAVE, addr) < 0) {
        result.ok = false;
        result.error = "Failed to select I2C slave 0x" + std::to_string(addr) + ": " + std::strerror(errno);
        close(file);
        return result;
    }

    // 1) Trigger measurement
    if (write(file, MEASURE_CMD, sizeof(MEASURE_CMD)) != (ssize_t)sizeof(MEASURE_CMD)) {
        result.ok = false;
        result.error = "Failed to write measurement command: " + std::string(std::strerror(errno));
        close(file);
        return result;
    }

    // 2) Wait for conversion
    usleep(MEASURE_DELAY_US);

    // 3) Read 7 bytes back
    uint8_t buf[READ_LEN] = {0};
    if (read(file, buf, READ_LEN) != (ssize_t)READ_LEN) {
        result.ok = false;
        result.error = "Failed to read AHT30 data: " + std::string(std::strerror(errno));
        close(file);
        return result;
    }

    close(file);

    // BUSY bit (bit7 of status). If set, you may have read a previous sample.
    bool busy = (buf[0] & 0x80) != 0;

    // 4) CRC check over first 6 bytes
    uint8_t crc_calc = crc8_aht(buf, 6);
    uint8_t crc_recv = buf[6];
    if (crc_calc != crc_recv) {
        result.ok = false;
        result.error = "CRC mismatch: calculated 0x" + std::to_string((int)crc_calc) +
                       " but received 0x" + std::to_string((int)crc_recv);
        return result;
    }

    // 5) Parse raw humidity (20 bits) + raw temperature (20 bits)
    uint32_t rh_raw =
        ((uint32_t)buf[1] << 12) |
        ((uint32_t)buf[2] <<  4) |
        ((uint32_t)(buf[3] >> 4) & 0x0F);

    uint32_t t_raw =
        (((uint32_t)buf[3] & 0x0F) << 16) |
        ((uint32_t)buf[4] <<  8) |
        ((uint32_t)buf[5]);

    // 6) Convert to physical units
    double humidity = (rh_raw / 1048576.0) * 100.0;      // 2^20
    double tempC    = (t_raw  / 1048576.0) * 200.0 - 50.0;
    double tempF    = (tempC * 9.0 / 5.0) + 32.0;

    result.ok = true;
    result.reading.temp_c = tempC;
    result.reading.temp_f = tempF;
    result.reading.humidity = humidity;
    result.reading.status = buf[0];
    result.reading.busy = busy;

    return result;
}

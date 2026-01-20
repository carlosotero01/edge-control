#include "aht30_sensor.h"

#include <iostream>
#include <sstream>
#include <ctime>
#include <iomanip>

#include "../third_party/httplib.h"

static std::string iso8601_utc_now() {
    std::time_t t = std::time(nullptr);
    std::tm tm{};
    gmtime_r(&t, &tm);
    std::ostringstream oss;
    oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%SZ");
    return oss.str();
}

static std::string json_escape(const std::string& s) {
    std::ostringstream oss;
    for (char c : s) {
        switch (c) {
            case '\\': oss << "\\\\"; break;
            case '"':  oss << "\\\""; break;
            case '\n': oss << "\\n";  break;
            case '\r': oss << "\\r";  break;
            case '\t': oss << "\\t";  break;
            default:   oss << c;      break;
        }
    }
    return oss.str();
}

int main() {
    httplib::Server server;

    server.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"status\":\"ok\"}", "application/json");
        res.status = 200;
    });

    server.Get("/read", [](const httplib::Request&, httplib::Response& res) {
        auto r = read_aht30_once("/dev/i2c-1", 0x38);

        if (!r.ok) {
            std::ostringstream err;
            err << "{"
                << "\"status\":\"error\","
                << "\"timestamp\":\"" << iso8601_utc_now() << "\","
                << "\"error\":\"" << json_escape(r.error) << "\""
                << "}";
            res.set_content(err.str(), "application/json");
            res.status = 500;
            return;
        }

        std::ostringstream out;
        out << std::fixed << std::setprecision(2);
        out << "{"
            << "\"status\":\"ok\","
            << "\"timestamp\":\"" << iso8601_utc_now() << "\","
            << "\"temp_c\":" << r.reading.temp_c << ","
            << "\"temp_f\":" << r.reading.temp_f << ","
            << "\"humidity\":" << r.reading.humidity << ","
            << "\"busy\":" << (r.reading.busy ? "true" : "false") << ","
            << "\"status_byte\":" << (int)r.reading.status
            << "}";

        res.set_content(out.str(), "application/json");
        res.status = 200;
    });

    std::cout << "AHT30 daemon listening on 0.0.0.0:7070\n";
    server.listen("0.0.0.0", 7070);

    return 0;
}


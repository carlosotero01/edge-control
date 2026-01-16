# v1.0.1
from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from datetime import datetime, timezone
from pydantic import BaseModel
import random

app = FastAPI(title="Edge Control")

current_sim_temp = 22.0

class PowerStateResponse(BaseModel):
    powerOn: bool

class TempResponse(BaseModel):
    value_c: float
    timestamp: str

ROOT_DIR = Path(__file__).resolve().parents[2]
CLIENT_DIR = ROOT_DIR / "client"

app.mount("/static", StaticFiles(directory=str(CLIENT_DIR)), name="static")

@app.get("/")
def index():
    return FileResponse(str(CLIENT_DIR / "index.html"))

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/power", response_model=PowerStateResponse)
def set_power_state(powerOn: bool = Query(...)):
    return PowerStateResponse(powerOn=powerOn)

@app.get("/temperature", response_model=TempResponse)
def get_temperature():
    global current_sim_temp

    delta = random.uniform(-0.5, 0.5)
    current_sim_temp += delta

    if current_sim_temp > 30.0:
        current_sim_temp -= 0.2
    elif current_sim_temp < 15.0:
        current_sim_temp += 0.2

    value_c = round(current_sim_temp, 2)
    ts = datetime.now(timezone.utc).isoformat()
    return TempResponse(value_c=value_c, timestamp=ts)


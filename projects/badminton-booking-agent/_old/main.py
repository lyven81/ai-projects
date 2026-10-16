"""
Badminton Court Booking Agent - FastAPI REST API  
Agentic AI workflow using code-as-action pattern
"""
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
from dotenv import load_dotenv
import google.generativeai as genai
from tinydb import TinyDB, Query
from datetime import datetime, timedelta
import re, io, sys, traceback

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

# Only configure if API key is valid
if GOOGLE_API_KEY and GOOGLE_API_KEY != "placeholder_key_to_update":
    genai.configure(api_key=GOOGLE_API_KEY)
    API_CONFIGURED = True
else:
    API_CONFIGURED = False

app = FastAPI(title="Badminton Booking Agent API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

db = TinyDB('badminton_booking_subang.json')
courts_tbl = db.table('courts')
bookings_tbl = db.table('bookings')

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    answer: str
    status: str

# Helper functions
def next_booking_id(tbl, prefix="BKG"):
    records = tbl.all()
    if not records:
        return f"{prefix}001"
    nums = [int(r.get("booking_id", prefix+"000")[len(prefix):]) for r in records if r.get("booking_id", "").startswith(prefix)]
    return f"{prefix}{max(nums, default=0) + 1:03d}"

def get_current_revenue(tbl):
    records = tbl.all()
    if not records:
        return 0.0
    return max(records, key=lambda x: x.get("timestamp", "")).get("revenue_after_booking", 0.0)

def is_weekend(date_str):
    return datetime.strptime(date_str, "%Y-%m-%d").weekday() >= 5

def is_daytime(time_str):
    return 6 <= int(time_str.split(":")[0]) < 18

def get_hourly_rate(date_str, time_str):
    weekend, daytime = is_weekend(date_str), is_daytime(time_str)
    return (90.0 if weekend else 80.0) if daytime else (120.0 if weekend else 100.0)

def has_time_conflict(court_id, date_str, start_time, end_time, bookings_tbl):
    start = datetime.strptime(f"{date_str} {start_time}", "%Y-%m-%d %H:%M")
    end = datetime.strptime(f"{date_str} {end_time}", "%Y-%m-%d %H:%M")
    if end <= start:
        end += timedelta(days=1)
    existing = bookings_tbl.search((Query().court_id == court_id) & (Query().booking_date == date_str) & (Query().status.one_of(["confirmed", "pending"])))
    for b in existing:
        ex_start = datetime.strptime(f"{b['booking_date']} {b['start_time']}", "%Y-%m-%d %H:%M")
        ex_end = datetime.strptime(f"{b['booking_date']} {b['end_time']}", "%Y-%m-%d %H:%M")
        if ex_end <= ex_start:
            ex_end += timedelta(days=1)
        if not (end <= ex_start or start >= ex_end):
            return True
    return False

def calculate_end_time(start_time, hours):
    start = datetime.strptime(f"2025-01-01 {start_time}", "%Y-%m-%d %H:%M")
    return (start + timedelta(hours=hours)).strftime("%H:%M")

PROMPT = """You are Subang Badminton Arena booking assistant. WRITE PYTHON CODE.

Database: courts_tbl, bookings_tbl | Functions: next_booking_id, get_current_revenue, is_weekend, is_daytime, get_hourly_rate, has_time_conflict, calculate_end_time, datetime, timedelta
Pricing: Day(6am-6pm) Weekday RM80/Weekend RM90 | Night(6pm-6am) Weekday RM100/Weekend RM120
Reference: Sunday, 23 Nov 2025

Set STATUS (success|court_unavailable|time_conflict|invalid_request) and answer_text
Output: Python code in markdown block

Request: {question}"""

def generate_code(prompt):
    if not API_CONFIGURED:
        raise HTTPException(500, "API key not configured. Please set GOOGLE_API_KEY environment variable.")
    model = genai.GenerativeModel("gemini-2.0-flash-exp", generation_config=genai.GenerationConfig(temperature=0.2))
    response = model.generate_content(prompt)
    return response.candidates[0].content.parts[0].text if response.candidates else ""

def extract_code(text):
    m = re.search(r'```python\s*\n(.*?)```', text, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else text.strip()

def execute_code(code, user_request):
    SAFE = {"Query": Query, "next_booking_id": next_booking_id, "get_current_revenue": get_current_revenue, 
            "is_weekend": is_weekend, "is_daytime": is_daytime, "get_hourly_rate": get_hourly_rate,
            "has_time_conflict": has_time_conflict, "calculate_end_time": calculate_end_time, 
            "datetime": datetime, "timedelta": timedelta, "user_request": user_request}
    LOCALS = {"db": db, "courts_tbl": courts_tbl, "bookings_tbl": bookings_tbl}
    stdout, old = io.StringIO(), sys.stdout
    sys.stdout = stdout
    err = None
    try:
        exec(code, SAFE, LOCALS)
    except Exception:
        err = traceback.format_exc()
    finally:
        sys.stdout = old
    return {"code": code, "error": err, "answer": LOCALS.get("answer_text", "No response"), "status": LOCALS.get("STATUS", "unknown")}

@app.get("/")
async def root():
    """Serve the chat interface"""
    return FileResponse("index.html")

@app.get("/api/status")
async def status():
    """API status endpoint"""
    return {
        "message": "Badminton Booking Agent API",
        "version": "1.0.0",
        "docs": "/docs",
        "api_configured": API_CONFIGURED,
        "status": "API key required" if not API_CONFIGURED else "Ready"
    }

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        content = generate_code(PROMPT.format(question=request.message))
        result = execute_code(extract_code(content), request.message)
        if result["error"]:
            raise HTTPException(500, detail=f"Error: {result['error']}")
        return ChatResponse(answer=result["answer"], status=result["status"])
    except Exception as e:
        raise HTTPException(500, detail=str(e))

@app.get("/api/courts")
async def get_courts(status: Optional[str] = None):
    courts = [c for c in courts_tbl.all() if not status or c.get("status") == status]
    return {"courts": courts, "total": len(courts)}

@app.get("/api/bookings")
async def get_bookings(status: Optional[str] = None, date: Optional[str] = None):
    bookings = [b for b in bookings_tbl.all() if (not status or b.get("status") == status) and (not date or b.get("booking_date") == date)]
    return {"bookings": bookings, "total": len(bookings)}

@app.get("/api/revenue")
async def get_revenue():
    return {"current_revenue": get_current_revenue(bookings_tbl), "total_bookings": len(bookings_tbl.all())}

@app.on_event("startup")
async def startup():
    if not courts_tbl.all():
        for i in range(1, 13):
            courts_tbl.insert({"court_id": f"CRT{i:03d}", "court_name": f"Court {i}", "surface_type": "Rubber Mat", 
                              "facilities": ["LED", "AC", "Scoreboard"], "status": "available", "location": "Subang Arena"})
        bookings_tbl.insert({"booking_id": "BKG001", "court_id": "OPENING", "court_name": "OPENING", "customer_name": "BALANCE",
                            "customer_ic": "", "booking_date": "2025-11-23", "start_time": "00:00", "end_time": "00:00",
                            "duration_hours": 0, "hourly_rates": [], "total_amount_myr": 0.0, "revenue_after_booking": 15000.0,
                            "status": "completed", "timestamp": "2025-11-23T00:00:00"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))

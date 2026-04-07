from app.seed import seed_database
import uvicorn

if __name__ == "__main__":
    seed_database()
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

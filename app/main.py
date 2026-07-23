import logging
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .openrouter import OpenRouterError, generate_recipes, recognize_ingredients

logger = logging.getLogger("uvicorn.error")

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Fridge Recipe App")


class RecipeRequest(BaseModel):
    ingredients: list[str]

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/recognize")
async def recognize(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드할 수 있습니다.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")

    try:
        result = recognize_ingredients(image_bytes, mime_type=file.content_type)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error during recognition")
        raise HTTPException(status_code=500, detail=f"서버 내부 오류: {e}")

    return result


@app.post("/api/recipes")
async def recipes(req: RecipeRequest):
    ingredient_names = [name.strip() for name in req.ingredients if name.strip()]
    if not ingredient_names:
        raise HTTPException(status_code=400, detail="재료 목록이 비어 있습니다.")

    try:
        result = generate_recipes(ingredient_names)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error during recipe generation")
        raise HTTPException(status_code=500, detail=f"서버 내부 오류: {e}")

    return result

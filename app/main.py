import logging
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .openrouter import OpenRouterError, generate_recipes, recognize_ingredients
from .supabase_client import SupabaseAuthError, authenticate

logger = logging.getLogger("uvicorn.error")

BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_DIR / "public"
STATIC_DIR = PUBLIC_DIR / "static"
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"

app = FastAPI(title="Fridge Recipe App")


class RecipeRequest(BaseModel):
    ingredients: list[str]


class PreferencesRequest(BaseModel):
    allergies: list[str] = []
    dislikes: list[str] = []


class SaveRecipeRequest(BaseModel):
    title: str
    ingredients_have: list[str] = []
    ingredients_missing: list[str] = []
    steps: list[str] = []
    estimated_time_minutes: int | None = None
    source: str = "fridge-scan"


def _auth(authorization):
    try:
        return authenticate(authorization)
    except SupabaseAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))

if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(TEMPLATES_DIR / "index.html")


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


@app.get("/api/users/me")
async def get_me(authorization: str = Header(None)):
    user, client = _auth(authorization)
    try:
        existing = client.table("users_tbl").select("*").eq("id", user.id).execute()
        if not existing.data:
            client.table("users_tbl").insert({"id": user.id, "email": user.email}).execute()
            existing = client.table("users_tbl").select("*").eq("id", user.id).execute()
        return existing.data[0]
    except Exception as e:
        logger.exception("프로필 조회 실패")
        raise HTTPException(status_code=500, detail=f"프로필 조회 실패: {e}")


@app.patch("/api/users/me/preferences")
async def update_preferences(req: PreferencesRequest, authorization: str = Header(None)):
    user, client = _auth(authorization)
    prefs = {"allergies": req.allergies, "dislikes": req.dislikes}
    try:
        result = client.table("users_tbl").update({"preferences": prefs}).eq("id", user.id).execute()
        if not result.data:
            client.table("users_tbl").insert(
                {"id": user.id, "email": user.email, "preferences": prefs}
            ).execute()
        return {"preferences": prefs}
    except Exception as e:
        logger.exception("환경설정 업데이트 실패")
        raise HTTPException(status_code=500, detail=f"환경설정 업데이트 실패: {e}")


@app.post("/api/recipes/saved")
async def save_recipe(req: SaveRecipeRequest, authorization: str = Header(None)):
    user, client = _auth(authorization)
    row = {
        "user_id": user.id,
        "title": req.title,
        "ingredients_have": req.ingredients_have,
        "ingredients_missing": req.ingredients_missing,
        "steps": req.steps,
        "estimated_time_minutes": req.estimated_time_minutes,
        "source": req.source,
    }
    try:
        result = client.table("recipes_tbl").insert(row).execute()
        return result.data[0]
    except Exception as e:
        logger.exception("레시피 저장 실패")
        raise HTTPException(status_code=500, detail=f"레시피 저장 실패: {e}")


@app.get("/api/recipes/saved")
async def list_saved_recipes(authorization: str = Header(None)):
    user, client = _auth(authorization)
    try:
        result = (
            client.table("recipes_tbl")
            .select("*")
            .eq("user_id", user.id)
            .order("saved_at", desc=True)
            .execute()
        )
        return {"recipes": result.data}
    except Exception as e:
        logger.exception("저장된 레시피 조회 실패")
        raise HTTPException(status_code=500, detail=f"저장된 레시피 조회 실패: {e}")


@app.delete("/api/recipes/saved/{recipe_id}")
async def delete_saved_recipe(recipe_id: str, authorization: str = Header(None)):
    user, client = _auth(authorization)
    try:
        client.table("recipes_tbl").delete().eq("id", recipe_id).eq("user_id", user.id).execute()
        return {"ok": True}
    except Exception as e:
        logger.exception("레시피 삭제 실패")
        raise HTTPException(status_code=500, detail=f"레시피 삭제 실패: {e}")

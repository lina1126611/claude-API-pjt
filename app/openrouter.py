import base64
import io
import json
import logging
import os
import re

import pillow_avif  # noqa: F401  (registers AVIF support in Pillow)
import requests
from dotenv import load_dotenv
from PIL import Image

load_dotenv()

logger = logging.getLogger("uvicorn.error")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_VISION_MODEL = os.getenv("OPENROUTER_VISION_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free")
OPENROUTER_TEXT_MODEL = os.getenv("OPENROUTER_TEXT_MODEL", "openai/gpt-oss-20b:free")
BASE_URL = "https://openrouter.ai/api/v1"

RECOGNITION_PROMPT = (
    "이 냉장고 내부 사진을 보고 보이는 식재료 목록을 인식해줘. "
    "다른 설명 없이 아래 JSON 배열 형식으로만 응답해줘.\n"
    '[{"name": "재료명", "confidence": "high|medium|low"}]'
)

RECIPE_PROMPT_TEMPLATE = (
    "다음은 냉장고에 있는 재료 목록이야: __INGREDIENTS__\n\n"
    "이 재료들을 최대한 활용해서 만들 수 있는 요리를 2~3가지 추천해줘. "
    "일부 재료가 부족해도 괜찮으니 부족한 재료도 함께 알려줘. "
    "다른 설명 없이 아래 JSON 배열 형식으로만 응답해줘.\n"
    '[{"title": "요리명", "ingredients_have": ["보유 재료"], '
    '"ingredients_missing": ["부족한 재료"], "steps": ["조리 순서 1", "조리 순서 2"], '
    '"estimated_time_minutes": 15}]'
)


class OpenRouterError(Exception):
    pass


def _strip_code_fence(text):
    match = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    return match.group(1) if match else text


def _find_balanced_json_array(text):
    candidates = []
    start = text.find("[")
    while start != -1:
        depth = 0
        in_string = False
        escape = False
        for i in range(start, len(text)):
            ch = text[i]
            if in_string:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_string = False
                continue
            if ch == '"':
                in_string = True
            elif ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    candidate = text[start : i + 1]
                    try:
                        candidates.append(json.loads(candidate))
                    except json.JSONDecodeError:
                        pass
                    break
        start = text.find("[", start + 1)

    if not candidates:
        raise ValueError("응답에서 유효한 JSON 배열을 찾을 수 없습니다.")

    # 우리가 기대하는 응답은 항상 "객체 배열"(레시피 목록, 재료 목록)이다.
    # 설명 중에 등장하는 빈 배열이나, 객체 내부의 steps/ingredients 같은 문자열 배열이
    # 더 길다는 이유로 잘못 뽑히지 않도록, 원소가 전부 dict인 배열을 우선한다.
    object_arrays = [c for c in candidates if isinstance(c, list) and c and all(isinstance(item, dict) for item in c)]
    if object_arrays:
        return max(object_arrays, key=len)
    return max(candidates, key=lambda c: len(c) if isinstance(c, list) else 0)


def _extract_json_array(text):
    return _find_balanced_json_array(_strip_code_fence(text))


def _call_chat_completion(model, messages):
    payload = {"model": model, "messages": messages}
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "fridge-recipe-app",
    }

    last_error = None
    for attempt in range(2):
        try:
            resp = requests.post(f"{BASE_URL}/chat/completions", json=payload, headers=headers, timeout=120)
        except requests.exceptions.Timeout:
            last_error = "OpenRouter 응답이 시간 내에 오지 않았습니다 (timeout). 잠시 후 다시 시도해주세요."
            continue
        except requests.exceptions.RequestException as e:
            last_error = f"OpenRouter 요청 중 네트워크 오류: {e}"
            continue

        if resp.status_code == 200:
            try:
                data = resp.json()
            except ValueError:
                last_error = f"OpenRouter 응답이 JSON이 아닙니다: {resp.text[:500]}"
                continue
            if "choices" in data:
                return data["choices"][0]["message"]["content"]
            last_error = f"OpenRouter 응답에 choices가 없습니다: {json.dumps(data, ensure_ascii=False)[:500]}"
        else:
            last_error = f"OpenRouter API 오류 ({resp.status_code}): {resp.text[:500]}"

    raise OpenRouterError(last_error)


def _normalize_to_jpeg(image_bytes):
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()
    except Exception as e:
        raise OpenRouterError(f"이미지를 열 수 없습니다 (지원하지 않는 형식일 수 있음): {e}")

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def recognize_ingredients(image_bytes, mime_type="image/jpeg"):
    if not OPENROUTER_API_KEY:
        raise OpenRouterError("OPENROUTER_API_KEY가 설정되지 않았습니다.")

    jpeg_bytes = _normalize_to_jpeg(image_bytes)
    b64 = base64.b64encode(jpeg_bytes).decode("utf-8")
    data_uri = f"data:image/jpeg;base64,{b64}"

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": RECOGNITION_PROMPT},
                {"type": "image_url", "image_url": {"url": data_uri}},
            ],
        }
    ]
    content = _call_chat_completion(OPENROUTER_VISION_MODEL, messages)

    try:
        ingredients = _extract_json_array(content)
    except (ValueError, json.JSONDecodeError):
        ingredients = [{"name": line.strip("- ").strip(), "confidence": "unknown"} for line in content.splitlines() if line.strip()]

    return {"ingredients": ingredients, "raw_model_response": content}


def generate_recipes(ingredient_names):
    if not OPENROUTER_API_KEY:
        raise OpenRouterError("OPENROUTER_API_KEY가 설정되지 않았습니다.")
    if not ingredient_names:
        raise OpenRouterError("재료 목록이 비어 있습니다.")

    prompt = RECIPE_PROMPT_TEMPLATE.replace("__INGREDIENTS__", ", ".join(ingredient_names))
    messages = [{"role": "user", "content": prompt}]

    content = None
    for attempt in range(2):
        content = _call_chat_completion(OPENROUTER_TEXT_MODEL, messages)
        try:
            recipes = _extract_json_array(content)
            return {"recipes": recipes, "raw_model_response": content}
        except ValueError:
            logger.warning("레시피 JSON 파싱 실패 (attempt %d), 원문: %s", attempt + 1, content)

    raise OpenRouterError(f"레시피 응답을 JSON으로 파싱하지 못했습니다: {content[:500] if content else ''}")

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const dropHint = document.getElementById("dropHint");
const recognizeBtn = document.getElementById("recognizeBtn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const ingredientList = document.getElementById("ingredientList");
const addForm = document.getElementById("addForm");
const addInput = document.getElementById("addInput");
const recipeBtn = document.getElementById("recipeBtn");
const recipeStatusEl = document.getElementById("recipeStatus");
const recipeResultEl = document.getElementById("recipeResult");
const recipeList = document.getElementById("recipeList");

let selectedFile = null;
let ingredients = [];

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length) {
    handleFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) {
    handleFile(fileInput.files[0]);
  }
});

function handleFile(file) {
  selectedFile = file;
  const url = URL.createObjectURL(file);
  preview.src = url;
  preview.hidden = false;
  dropHint.hidden = true;
  recognizeBtn.disabled = false;
  resultEl.hidden = true;
  statusEl.hidden = true;
  recipeResultEl.hidden = true;
  recipeStatusEl.hidden = true;
}

function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.hidden = false;
  el.classList.toggle("error", isError);
}

function renderIngredients() {
  ingredientList.innerHTML = "";
  ingredients.forEach((ing, idx) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = ing.name;
    const confidence = document.createElement("span");
    confidence.className = "confidence";
    confidence.textContent = ing.confidence || "";
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "삭제";
    removeBtn.addEventListener("click", () => {
      ingredients.splice(idx, 1);
      renderIngredients();
    });

    const left = document.createElement("div");
    left.appendChild(label);
    left.appendChild(document.createTextNode(" "));
    left.appendChild(confidence);

    li.appendChild(left);
    li.appendChild(removeBtn);
    ingredientList.appendChild(li);
  });
}

addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = addInput.value.trim();
  if (!name) return;
  ingredients.push({ name, confidence: "manual" });
  addInput.value = "";
  renderIngredients();
});

recognizeBtn.addEventListener("click", async () => {
  if (!selectedFile) return;
  recognizeBtn.disabled = true;
  setStatus(statusEl, "이미지를 인식하는 중입니다...");
  resultEl.hidden = true;
  recipeResultEl.hidden = true;
  recipeStatusEl.hidden = true;

  const formData = new FormData();
  formData.append("file", selectedFile);

  try {
    const res = await fetch("/api/recognize", { method: "POST", body: formData });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`서버 오류 (status ${res.status}). 잠시 후 다시 시도해주세요.`);
    }
    if (!res.ok) {
      throw new Error(data.detail || "인식에 실패했습니다.");
    }
    ingredients = data.ingredients || [];
    renderIngredients();
    resultEl.hidden = false;
    setStatus(statusEl, `인식 완료 (${ingredients.length}개 재료)`);
  } catch (err) {
    setStatus(statusEl, err.message, true);
  } finally {
    recognizeBtn.disabled = false;
  }
});

function renderRecipes(recipeItems) {
  recipeList.innerHTML = "";
  recipeItems.forEach((recipe) => {
    const card = document.createElement("div");
    card.className = "recipe-card";

    const title = document.createElement("h3");
    title.textContent = recipe.title || "이름 없는 요리";
    card.appendChild(title);

    if (recipe.estimated_time_minutes) {
      const time = document.createElement("p");
      time.className = "recipe-time";
      time.textContent = `예상 조리 시간: 약 ${recipe.estimated_time_minutes}분`;
      card.appendChild(time);
    }

    if (recipe.ingredients_have?.length) {
      const have = document.createElement("p");
      have.innerHTML = `<strong>보유 재료:</strong> ${recipe.ingredients_have.join(", ")}`;
      card.appendChild(have);
    }

    if (recipe.ingredients_missing?.length) {
      const missing = document.createElement("p");
      missing.innerHTML = `<strong>부족한 재료:</strong> ${recipe.ingredients_missing.join(", ")}`;
      card.appendChild(missing);
    }

    if (recipe.steps?.length) {
      const stepsTitle = document.createElement("strong");
      stepsTitle.textContent = "조리 순서";
      card.appendChild(stepsTitle);

      const ol = document.createElement("ol");
      recipe.steps.forEach((step) => {
        const li = document.createElement("li");
        li.textContent = step;
        ol.appendChild(li);
      });
      card.appendChild(ol);
    }

    recipeList.appendChild(card);
  });
}

recipeBtn.addEventListener("click", async () => {
  if (!ingredients.length) {
    setStatus(recipeStatusEl, "재료가 없습니다. 먼저 식재료를 인식하거나 추가해주세요.", true);
    return;
  }

  recipeBtn.disabled = true;
  recipeResultEl.hidden = true;
  setStatus(recipeStatusEl, "레시피를 생성하는 중입니다...");

  try {
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredients: ingredients.map((ing) => ing.name) }),
    });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`서버 오류 (status ${res.status}). 잠시 후 다시 시도해주세요.`);
    }
    if (!res.ok) {
      throw new Error(data.detail || "레시피 생성에 실패했습니다.");
    }
    renderRecipes(data.recipes || []);
    recipeResultEl.hidden = false;
    setStatus(recipeStatusEl, `레시피 ${data.recipes?.length || 0}개 생성 완료`);
  } catch (err) {
    setStatus(recipeStatusEl, err.message, true);
  } finally {
    recipeBtn.disabled = false;
  }
});

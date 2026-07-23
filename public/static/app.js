import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const authStatus = document.getElementById("authStatus");
const authLoggedOut = document.getElementById("authLoggedOut");
const authLoggedIn = document.getElementById("authLoggedIn");
const authEmailLabel = document.getElementById("authEmailLabel");
const logoutBtn = document.getElementById("logoutBtn");

const savedRecipesSection = document.getElementById("savedRecipesSection");
const savedRecipesStatus = document.getElementById("savedRecipesStatus");
const savedRecipeList = document.getElementById("savedRecipeList");

let selectedFile = null;
let ingredients = [];
let currentRecipes = [];

function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.hidden = false;
  el.classList.toggle("error", isError);
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

function renderAuthState(session) {
  if (session) {
    authLoggedOut.hidden = true;
    authLoggedIn.hidden = false;
    authEmailLabel.textContent = session.user.email;
    savedRecipesSection.hidden = false;
    loadSavedRecipes();
  } else {
    authLoggedOut.hidden = false;
    authLoggedIn.hidden = true;
    savedRecipesSection.hidden = true;
    savedRecipeList.innerHTML = "";
  }
}

supabase.auth.onAuthStateChange((_event, session) => renderAuthState(session));
supabase.auth.getSession().then(({ data }) => renderAuthState(data.session));

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await handleAuth("login");
});

signupBtn.addEventListener("click", async () => {
  await handleAuth("signup");
});

async function handleAuth(mode) {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) return;

  setStatus(authStatus, mode === "login" ? "로그인 중..." : "회원가입 중...");
  const { error } =
    mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

  if (error) {
    setStatus(authStatus, error.message, true);
    return;
  }
  authStatus.hidden = true;
  if (mode === "signup") {
    setStatus(authStatus, "회원가입 완료. 이메일 확인이 필요할 수 있습니다.");
  }
}

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
});

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
  recipeItems.forEach((recipe, idx) => {
    recipeList.appendChild(buildRecipeCard(recipe, { showSave: true, recipeIndex: idx }));
  });
}

function buildRecipeCard(recipe, { showSave = false, showDelete = false, recipeIndex = null } = {}) {
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

  if (showSave) {
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "이 레시피 저장";
    saveBtn.addEventListener("click", () => saveRecipe(recipe, saveBtn));
    card.appendChild(saveBtn);
  }

  if (showDelete) {
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "삭제";
    deleteBtn.className = "danger";
    deleteBtn.addEventListener("click", () => deleteSavedRecipe(recipe.id, card));
    card.appendChild(deleteBtn);
  }

  return card;
}

async function saveRecipe(recipe, buttonEl) {
  const token = await getAccessToken();
  if (!token) {
    setStatus(recipeStatusEl, "레시피를 저장하려면 먼저 로그인해주세요.", true);
    return;
  }

  buttonEl.disabled = true;
  try {
    const res = await fetch("/api/recipes/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: recipe.title || "이름 없는 요리",
        ingredients_have: recipe.ingredients_have || [],
        ingredients_missing: recipe.ingredients_missing || [],
        steps: recipe.steps || [],
        estimated_time_minutes: recipe.estimated_time_minutes || null,
        source: "fridge-scan",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "저장에 실패했습니다.");
    buttonEl.textContent = "저장됨";
    loadSavedRecipes();
  } catch (err) {
    buttonEl.disabled = false;
    setStatus(recipeStatusEl, err.message, true);
  }
}

async function loadSavedRecipes() {
  const token = await getAccessToken();
  if (!token) return;

  try {
    const res = await fetch("/api/recipes/saved", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "저장된 레시피 조회에 실패했습니다.");
    renderSavedRecipes(data.recipes || []);
  } catch (err) {
    setStatus(savedRecipesStatus, err.message, true);
  }
}

function renderSavedRecipes(recipes) {
  savedRecipeList.innerHTML = "";
  if (!recipes.length) {
    setStatus(savedRecipesStatus, "저장된 레시피가 없습니다.");
    return;
  }
  savedRecipesStatus.hidden = true;
  recipes.forEach((recipe) => {
    savedRecipeList.appendChild(buildRecipeCard(recipe, { showDelete: true }));
  });
}

async function deleteSavedRecipe(recipeId, cardEl) {
  const token = await getAccessToken();
  if (!token) return;
  try {
    const res = await fetch(`/api/recipes/saved/${recipeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || "삭제에 실패했습니다.");
    }
    cardEl.remove();
  } catch (err) {
    setStatus(savedRecipesStatus, err.message, true);
  }
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
    currentRecipes = data.recipes || [];
    renderRecipes(currentRecipes);
    recipeResultEl.hidden = false;
    setStatus(recipeStatusEl, `레시피 ${currentRecipes.length}개 생성 완료`);
  } catch (err) {
    setStatus(recipeStatusEl, err.message, true);
  } finally {
    recipeBtn.disabled = false;
  }
});
